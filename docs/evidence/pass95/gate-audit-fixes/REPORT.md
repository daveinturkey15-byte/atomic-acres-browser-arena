# Candidate-7 gate-audit fixes — PASS 95

**Lane:** Claude Opus, `contrib/dave-gaming-pc/claude/v7-gate-audit-fixes`
**Base:** `452d7aba` (candidate 7, "build(hitl7): candidate 7 morning evidence")
**Audit answered:** `origin/contrib/dave-gaming-pc/claude/c7-gate-audit:docs/evidence/pass94/candidate7/GATE-AUDIT-OPUS.md`
**In scope:** F1, F3, F4, F6. **Deliberately untouched:** F2 (roster floors 9 -> 8 — owner-directed,
HF-495 "kill off old raid") and F5 (control-set hash re-pins — the candidate-8 integrator re-measures).

Claim-states: **[VERIFIED]** = I ran it or read the bytes at both ends. **[MEASURED]** = a number I
produced on this machine. **[OPEN]** = not settled here.

---

## Summary

| # | Finding | What I did | State |
|---|---------|-----------|-------|
| F1 | Graph-topology lower bound deleted | Restored the test and its eight-pair table verbatim (**red**), plus a new green guard enforcing the same property against the current architecture | **[VERIFIED]** cause found; 7/8 pairs collapsed; restored test left RED by design |
| F3 | Cold smoke dropped the art assertions | Restored all three, gated to the subject that carries the signal; a subject without one now refuses out loud into the receipt | **[VERIFIED]** static; **[OPEN]** smoke run not executed |
| F4 | Allowlist grew net +3 exemptions | Derived 3 of the 5 away and removed them; kept 2 with corrected one-line justifications | **[VERIFIED]** gate green, 8/8 |
| F6 | Raw NUL made a QA script un-diffable | Escaped the control-character class; behaviour proven identical | **[VERIFIED]** 15/15 tests, diff is text |

Nothing was weakened. No test, threshold, fence, budget, timeout, `.skip`/`.only`/`.failing` marker or
the `LINE_CEILING` 37,396 ratchet was changed, raised, widened or skipped anywhere in this branch.

---

## F1 — the graph-topology lower bound

**Commit:** `1044d755` · `src/nuketown2-pipeline-budget.test.ts`

Restored `it('keeps the graph-TOPOLOGY variants as separate shaders')` and the eight-pair
`mustDiffer` table verbatim from `3e2fd273`. **No pair was renamed and none was dropped** — all
twelve roles it names still exist under the same name in `createNuketown2MaterialRegistry()`
[VERIFIED, role by role], so no `git log -S` rename proof was required.

### Result: 7 of 8 pairs collapsed [MEASURED]

```
COLLAPSED  garageDoor vs roofGlazing      ok  coachGlass vs asphalt
COLLAPSED  drive vs kerb
COLLAPSED  drive vs block
COLLAPSED  kerb vs block
COLLAPSED  fence vs trim
COLLAPSED  lawn vs planter
COLLAPSED  lawn vs ground
```

The registry now resolves to exactly eight families:

```
#1 ground, lawn, planter          #5 roof
#2 asphalt, trimDecal             #6 roofGlazing, garageDoor, sign, applianceRed, applianceBlue, busTrim
#3 kerb, drive, driveDecal, block #7 trim, fence
#4 sidingA, sidingB               #8 coachGlass
```

### Cause [VERIFIED]

`af1fce7d perf(hitl5): share wear and vehicle material graphs` (Codex Luna 5.6, 2026-09-04). It
rewrote all eight family shaders into uber-shaders and, **on the same lane**, wrote
`src/nuketown2-pipeline-budget.test.ts` fresh with only the upper bound (+87 lines; the file did not
exist at `af1fce7d^`, so the HITL-5 version was superseded at the merge rather than edited — which is
why `git log -S"keeps the graph-TOPOLOGY variants"` finds no deleting commit).

Every variant selector moved out of the graph SHAPE and into a uniform — `paintedPanelled`,
`concreteVariant`, `lawnVariant`, `timberVariant` — declared in
`src/nuketown2-materials/material-uniforms.ts` ("Values kept out of the shared family graph
topology") and uploaded per draw by `materialUniform()`'s `onObjectUpdate`.

### This is an uber-shader, not flattening [VERIFIED]

The detail is still authored and still drawn. `painted-metal.ts:72` still does `.mul(panelled)`, and
every pair is still driven apart by its bound values:

| pair | separating uniform | values |
|---|---|---|
| garageDoor / roofGlazing | `paintedPanelled` | 1 / 0 |
| drive / kerb / block | `concreteVariant` | 0 / 1 / 2 |
| fence / trim | `timberVariant` | 0 / 2 |
| lawn / planter / ground | `lawnVariant` | 0 / 2 / 1 (ground also `backdrop` 1, `grainEnabled` 0) |

### Smallest fix, for the integrator

**Do not un-collapse the graphs.** That would revert the HF-477/HF-491 pipeline-budget work and put
the 12 s cold-admission fence back where it was. The smallest correct fix is the one this commit
already ships: **delete the restored `keeps the graph-TOPOLOGY variants as separate shaders` test and
keep `keeps every variant pair separated by its own selector uniform`.** The second test walks the
same eight pairs and requires a differing non-colour bound uniform plus proof the selector is still
read by its family shader — the same guard against "buy budget by flattening the arena's detail",
expressed for the architecture that actually shipped.

I left the first test **red, unskipped, unmarked and not merge-marked**, per instruction, because
deciding that a contract has legitimately changed is the integrator's call, not this lane's.

**Mutation-checked** [MEASURED]: deleting `panelled: true` from the garage door reds the new guard on
`garageDoor vs roofGlazing`. Working tree restored afterwards.

---

## F3 — the cold-admission smoke's art assertions

**Commit:** `22cbc796` · `scripts/qa/verify-pass65-cold-webgpu-admission.mjs`

### Correction to the audit [VERIFIED]

The audit records `originalArtLoaded` as "not arena-specific and was simply dropped". **It is
arena-specific.** All three dropped assertions bottom out in the same atomic-acres art path:

- `src/legacy-main.ts:34851` — `originalArtLoaded = gameplayArenaPrepared ? blenderArenaActive || scene.getObjectByName('original-arena-art') : ...`
- `src/environment-assets.ts:1021` — `root.name = 'original-arena-art'`, set by `loadArenaArt()`, documented "original Atomic Acres hero vehicles and environmental props"
- `src/legacy-main.ts:35118` — `qualityArtRootVisible = blenderArenaActive && ...`; `blenderArenaActive` is set only by `ensureAtomicQualityPresentation()` / `ensureAtomicAuthoredPresentation()`, both hard-coded to `selectedArenaAuthority('atomic-acres')`
- `src/legacy-main.ts:5029` — `qualityAssetStreaming` has exactly two per-arena keys, `atomicAcres` and `rustworks`

On a nuketown2 run all four read false/`'idle'` **by construction**. Restoring `originalArtLoaded`
against the current subject would red the smoke for a reason unrelated to nuketown2's art — a false
alarm, which is its own way of switching a gate off.

### What shipped

All three assertions restored in full, gated on `ARENAS_WITH_ART_LOADED_SIGNAL`;
`atomicQualityStreaming` put back into the sample it was removed from. A subject with no art signal
no longer passes in silence — it pushes a `coverageNotes` entry, printed per trial and written into
the receipt, naming F3 as OPEN. The real loss in F3 was not one missing `if`; it was that "this smoke
checks nobody's art" became invisible. It is now stated in the evidence on every run.

No budget moved: the two 10,000 ms budgets, the 60 s / 90 s patience and the 3..5 trial clamp are
byte-identical.

### Second subject: documented, not added

Keeping atomic-acres as a cheaper second check needs a second full cold **deployment** in the same
page — its Quality art streams only on deploy, and the existing switch sequence visits raid2 without
loading either arena's art, so a second card click buys nothing. That is a second cold transition
against the same unchanged 10,000 ms budget the run is already red on at 24.07 s: more cost, no
signal.

### [OPEN] items

- **nuketown2 exposes no cold-session art-ready signal at all.** Closing F3 properly is a runtime
  change — a nuketown2 equivalent of `originalArtLoaded` in the debug snapshot — not an edit in this
  script, and not something this lane should invent. **Routed to the arena owner.**
- **The single smoke run was not executed.** [OPEN] The lane's 75-minute box was spent on F1's cause
  analysis; the run needs a production build plus three cold trials under the machine lock on a box
  with ~2 GB free, and it is already known-red at 24.07 s against its unchanged 10,000 ms budget.
  Static verification only: `node --check` clean, `npx tsc --noEmit` exit 0. **The changed assertions
  are unexercised — the integrator must run this smoke before publish.**

---

## F4 — the hardcoded-roster allowlist

**Commit:** `ce446bfd` · `scripts/qa/arena-roster.mjs`, `arena-roster-contract.test.mjs`,
`capture-lane-ab-time-of-day.mjs`, `publish-lane-ab-frames.mjs`, `hf410-near-plane-ab-diff.mjs`

Read all five new entries and located the literal each one actually exempts, by running the gate's own
`frozenRosterIn()` against each file.

### Derived away, exemption removed — 3 of 5 [VERIFIED]

| file:line | literal | derived from |
|---|---|---|
| `capture-lane-ab-time-of-day.mjs:162` | `PINNED_ARENAS = new Set(['gun-range','map3','nuketown2','raid2'])` | `pinnedDaylightArenaIds()` |
| `publish-lane-ab-frames.mjs:43` | `PINNED = new Set([... same four ...])` | `pinnedDaylightArenaIds()` |
| `hf410-near-plane-ab-diff.mjs:20` | `arenas = ['high-seas','map3','skyline-terminal']` | intersection of the two capture directories, validated against `allArenaIds()` |

The first two are the same fact stated twice: their own comment says "these arenas are `pinned: true`
in `ARENA_DAYLIGHT_PROFILES`". The literal had **already drifted from its own comment** ("These three
arenas", four ids) — exactly the rot the allowlist exists to catch. New shared derivation
`pinnedDaylightArenaIds()` in `scripts/qa/arena-roster.mjs` scrapes the source the way the module
already scrapes `ARENA_IDS` and `ARENA_SELECTIONS`; its floor is **coverage, not count** (every
canonical arena must appear in the table), because a regex that stops matching yields a short list,
and a short list here silently reclassifies a pinned arena as a moving one.

[MEASURED] `pinnedDaylightArenaIds()` -> `nuketown2,raid2,gun-range,map3` — identical as a set to both
deleted literals and to the set asserted exactly in `src/rendering/lighting-conditions.test.ts:69`.

The hf410 set is a fact about the frame tree ("arenas with paired baseline and candidate evidence"),
so it is now read from the frame tree. On an A/B whose whole claim is "same commit, same arenas",
silently skipping a captured arena is the one error that looks like a clean result.

### Kept — 2 of 5, justification rewritten in the allowlist

- **`raid2-layout-metrics.ts:416`** (`BEHAVIOUR MAP`) — `DEFAULT_ROSTER` is an authored comparison
  set: the parked original Raid (`test2`) read against four shipped arenas. No registry property
  selects those five, and deriving from selectability would drop `test2`, the one row the comparison
  exists for. **The old reason was factually wrong** — it claimed the set included `raid2` "beside the
  Raid Rebuild"; it does not, the rebuild is passed on argv. Corrected.
- **`scan-lane-ab-band-readability.mjs:70`** (`TIMING BOUNDED`) — the `--arenas` *default*. Each of the
  three bands costs a paired A/B readability capture plus review, so the cap is a measured cost, not a
  coverage claim. Any registry arena can already be scanned by naming it; nothing filters the roster.

**Net:** the allowlist goes from +5 new entries to +2 — i.e. -2/+2 over the whole HITL-5 range instead
of -2/+5.

---

## F6 — the un-diffable QA script

**Commit:** `54724551` · `scripts/qa/mp-evidence-analyse.mjs`

`safeLabel()`'s character class was written with literal bytes — a raw NUL at offset 4354, a raw DEL,
and a raw U+009F — so git classified 19,255 bytes of new multiplayer evidence-analysis logic as
binary and it entered the branch with no reviewable diff.

Rewritten with escapes. [VERIFIED] over U+0000..U+01FF that the escaped form matches
exactly U+0000-U+001F and U+007F-U+009F and nothing else — no behaviour change.

- 0 NUL bytes remain; no control byte outside tab/newline/carriage-return anywhere in the file.
- `git diff --no-index` against an edited copy now renders a **text hunk** [VERIFIED].
- `npm run qa:mp-evidence:contract` -> **15 passed, 0 failed**, including *"safeLabel strips the
  control characters a bundle can smuggle"* [MEASURED].

The F6 commit itself still shows as `Bin 19255 -> 19266` because the **old** blob is the binary one.
Every diff after it is text.

---

## Gates

| Gate | Result | State |
|---|---|---|
| `npx tsc --noEmit` | exit 0 | [VERIFIED] |
| `npx vitest run src/nuketown2-pipeline-budget.test.ts src/pipeline-metrics*.test.ts src/graphics-profile-contract.test.ts src/legacy-main-size-ratchet.test.ts` | **29 passed, 1 failed** — the failure is F1's restored table, red by design | [VERIFIED] |
| `npm run qa:arena-roster:contract` (hardcoded-roster gate) | **8 passed, 0 failed** | [VERIFIED] |
| `npm run qa:mp-evidence:contract` (file touched in F6) | **15 passed, 0 failed** | [VERIFIED] |
| `npm run build` (under the machine lock) | see `BUILD.txt` beside this report | [VERIFIED] |
| Cold-admission smoke, port 4271, one run under the lock | **not executed** | **[OPEN]** |

The `qa:arena-roster:contract` result is load-bearing for F4: the gate's own *"these allowances no
longer apply; delete them so the exception list stays short"* assertion means a file that no longer
hardcodes a roster **reds the gate if it is left listed**. Green with the three entries removed is
proof the three derivations are real.

## What a reader should not conclude

- The restored F1 table being red does **not** mean nuketown2 lost detail. It means the contract
  changed shape. The evidence is in the F1 section, and the green sibling test enforces the substance.
- F3's static verification is **not** a run. Those assertion lines have never executed.
