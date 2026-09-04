# PASS 94 — Load-time lane verification

**Machine** `dave-gaming-pc` (RTX 5080, 16,303 MiB) · **Harness** Claude Code (Opus 5.1)
**Worktree** `C:/Users/david/projects/aa-claude-lt` · **Branch** `contrib/dave-gaming-pc/claude/load-time-verified`
**Merge base** `50d6699c` (`origin/contrib/dave-gaming-pc/omp/pass84-overnight`) · **Head** `d57871de`
**Baseline build** built from a detached worktree at the exact merge base, `C:/Users/david/projects/aa-claude-lt-base`.

Both candidate branches were merged. Conflicts were additive-only (the
`lastMatchAdmissionProfile` type and `finalizeMatchAdmissionProfile` body) and both
sets of fields were kept.

| Branch | Verdict |
| :-- | :-- |
| `origin/contrib/dave-gaming-pc/claude/admission-rehearsal-scope` | **SHIP** — after the scheduler fix below |
| `origin/contrib/dave-gaming-pc/claude/admission-cadence-wait` | **DO-NOT-SHIP as a load-time win** (safe, but zero measured saving; see section 4) |

Claim states: `[VERIFIED]` = measured in this lane on this machine; `[OPEN]` = not
resolved here.

---

## 1. What the merge changed

- `src/legacy-main.ts` — both mechanisms wired; no other lane's arena modules touched.
- `src/legacy-main-size-ratchet.test.ts` — `LINE_CEILING` 37_100 -> 37_212. That is the
  exact arithmetic sum of the two independently measured deltas (37_100 + 24 + 88), not a
  number chosen to fit. Both source history entries are preserved and a merge entry was
  added; the ratchet stayed one-directional and was not relaxed.
- `src/weapon-rehearsal-scheduler.ts` / `.test.ts` — the defect fix in section 3 plus its
  first unit coverage.
- `scripts/qa/probe-weapon-switch-latency-cdp.mjs` — new gate, section 5.

---

## 2. `[VERIFIED]` Match admission, before vs after

`node scripts/qa/probe-arena-switch-matrix.mjs --dist dist --sources <arena> --max-edges 1
--session-edges 1` — the probe behind `docs/evidence/pass92/deploy-attribution/REPORT.md`.
Every run self-gated: ComfyUI idle, 0 rival Playwright browsers at launch, >= 12.4 GiB free
VRAM, hardware WebGPU device, 1600x900.

### atomic-acres

| Step | before (ms) | after (ms) | delta |
| :-- | --: | --: | --: |
| `admission-open` | 55.0 | 53.2 | -1.8 |
| `bot-spawn` | 2,136.4 | 2,186.2 | +49.8 |
| `corpse-pool` | 497.0 | 482.9 | -14.1 |
| `bot-presentations` | 1,898.2 | 1,744.2 | -154.0 |
| `rest-composition-compile` | 222.9 | 180.8 | -42.1 |
| **`weapon-switch-rehearsal`** | **5,161.8** | **721.7** | **-4,440.1** |
| `match-bound-first-shots` | 1,434.2 | 1,725.1 | +290.9 |
| `initial-match-settle` | 346.6 | 275.9 | -70.7 |
| **`stable-cadence-wait`** | **5,194.9** | **5,200.2** | **+5.3** |
| **Total admission** | **16,947.0** | **12,570.2** | **-4,376.8** |
| `deployMs` | 20,817 | 16,325 | -4,492 |

### nuketown2

| Step | before (ms) | after (ms) | delta |
| :-- | --: | --: | --: |
| `admission-open` | 46.1 | 59.0 | +12.9 |
| `bot-spawn` | 1,710.3 | 1,873.1 | +162.8 |
| `corpse-pool` | 425.2 | 369.0 | -56.2 |
| `bot-presentations` | 1,482.2 | 1,441.5 | -40.7 |
| `rest-composition-compile` | 227.4 | 229.6 | +2.2 |
| **`weapon-switch-rehearsal`** | **4,426.8** | **749.1** | **-3,677.7** |
| `match-bound-first-shots` | 1,458.9 | 2,091.1 | +632.2 |
| `initial-match-settle` | 373.6 | 434.3 | +60.7 |
| **`stable-cadence-wait`** | **5,252.3** | **5,255.7** | **+3.4** |
| **Total admission** | **15,402.8** | **12,502.4** | **-2,900.4** |
| `deployMs` | 19,228 | 16,379 | -2,849 |

### gun-range

| Step | before (ms) | after (ms) | delta |
| :-- | --: | --: | --: |
| `admission-open` | 52.0 | 39.7 | -12.3 |
| `bot-spawn` | 0.2 | 0.3 | +0.1 |
| `corpse-pool` | 500.0 | 437.8 | -62.2 |
| `bot-presentations` | 725.7 | 710.1 | -15.6 |
| `rest-composition-compile` | 196.7 | 224.2 | +27.5 |
| **`weapon-switch-rehearsal`** | **5,959.2** | **6,643.9** | **+684.7** |
| `match-bound-first-shots` | 1,224.5 | 1,302.4 | +77.9 |
| `initial-match-settle` | 367.6 | 394.1 | +26.5 |
| **`stable-cadence-wait`** | **5,178.6** | **5,213.0** | **+34.4** |
| **Total admission** | **14,204.5** | **14,965.5** | **+761.0** |
| `deployMs` | 18,083 | 18,985 | +902 |

`[VERIFIED]` **Gun Range gets nothing, by design and not by accident.**
`arenaPickupWeaponIds` projects Gun Range's hot set from `GUN_RANGE_FIELD_TEST_WEAPONS`,
which is the whole field-test roster — every weapon on that map is genuinely reachable, so
nothing is deferrable and the rehearsal keeps walking all of them. The +685 ms is run
variance on an unchanged code path, not a regression: two independent after-runs measured
6,050.3 ms and 6,643.9 ms against a 5,959.2 ms before.

`[VERIFIED]` The saving is exactly the scoping. On nuketown2 the published hot set is
`carbine, pistol, railgun, crimson-flamethrower` — 4 of 21 catalog weapons.

---

## 3. `[VERIFIED]` DEFECT FOUND AND FIXED — deferred warm-up forced submissions in a live match

`npm run qa:pass74:arena-boot-smoke` was **RED** on the merged head before the fix, on two
arenas, with 38 console errors each:

```
[atomic-acres:deferred weapon rehearsal] Error: Forced WebGPU submission requires an
idle completion frontier; 1 submission(s) remain
    at e.submitFrame (.../legacy-main-BWgsv-S2.js:27:71182)
```

Cause: `createDeferredWeaponRehearsalScheduler` called the admission state walk
(`exercisePreparedWebGpuWeaponSwitchesFor`) for the `respawn` and `pre-match-countdown`
windows. That walk forces submissions and flushes the queue, which is legal only while the
gameplay frame loop is not presenting — never true inside a live match. The scheduler had
**no unit coverage at all**, which is how it shipped.

**The fence was not relaxed.** The idle-frontier check is what keeps the 12 s WebGPU queue
bound meaningful. The deferred path now does the work it can legally do:
`prepareBrowserWeapon`, the asset/GPU-readiness half the `menu` window already used and the
one the synchronous pre-switch barrier uses. The `exercise` and `backend` inputs are gone
from the scheduler's type, so a forced submission is no longer reachable from a gameplay
frame. Admission still runs the full state walk for the weapons a player can hold. Two
regression tests cover the one-slice-per-frame walk and the combat no-op.

---

## 4. `[VERIFIED]` The adaptive cadence wait never fires — no measured saving

Luna's verdict on `admission-cadence-wait` reported 5.2 s -> 1.2-1.8 s. **That is not
reproduced here.** `stable-cadence-wait` is unchanged on all three arenas (+5.3, +3.4,
+34.4 ms), and every after-run publishes:

```
exitReason: "ceiling-timeout"    achievedWaitMs: 5,001-5,049
```

The wait's own telemetry says why (`weapon-switch-after-nuketown2.json`):

```
"cadence": { "waitedMs": 5021.83, "resets": 72, "samples": 72,
             "maximumGapMs": 82.07, "admittedDegraded": true,
             "exitReason": "ceiling-timeout", "consecutiveStableFrames": 0,
             "visibilityState": "visible", "documentHasFocus": true }
```

72 samples in 5.0 s is ~68 ms per admission warm frame. `resets == samples` means **every
single frame reset the stable window**, because every frame exceeds the 50 ms
`ADMISSION_CADENCE_MAX_LONG_TASK_MS` hitch threshold. 30 consecutive stable frames is
therefore unreachable, and the adaptive branch can never exit early. Focus emulation is on
and `documentHasFocus` is `true`, so this is not the headless-focus explanation from the
PASS 92 attribution report.

The base build behaves identically (`waitedMs 5034.25, resets 74, samples 74,
admittedDegraded true`), so this is a pre-existing property of the admission warm loop, not
something the branch introduced. The branch is **safe** — it adds one pure evaluation per
frame, cannot exit later than the existing 5 s ceiling, and its `exitReason` /
`achievedWaitMs` telemetry is what diagnosed this — but it delivers **0 ms**.

Nothing was widened to make it fire. Lowering the +/-20% tolerance or raising the 50 ms
long-task threshold would manufacture a green that the frame times do not support.

---

## 5. `[VERIFIED]` Weapon switching still feels instant

New gate `scripts/qa/probe-weapon-switch-latency-cdp.mjs`, 12 in-combat switches on
nuketown2, hardware WebGPU:

| | before | after |
| :-- | --: | --: |
| cycles committed | 12 / 12 | 12 / 12 |
| max synchronous switch cost | **1.605 ms** | **1.575 ms** |
| median synchronous switch cost | 0.855 ms | 0.910 ms |
| max frames to commit | 0 | 0 |
| `snapshot()` cost (measurement overhead) | 65.6 ms | 78.5 ms |
| `reachableDeferred` | n/a (no registry) | **`[]`** |

Every switch commits on the same tick, well under the 16.7 ms one-frame budget. The
`commitMs` figures (~66-71 ms) are dominated by the debug `snapshot()` call the probe uses
to read the authoritative weapon, which is why that cost is measured and reported beside
them; `syncMs` is the number that answers the question.

`reachableDeferred: []` is the load-bearing assertion: `switchWeapon` can only select the
loadout primary, the loadout sidearm or the held authority special, and
`createWeaponRehearsalPlan` puts all three in the admission hot set — so the
`synchronous-before-switch` branch is unreachable in normal play. The probe reds if a
future loadout or handicap rule ever makes a deferred weapon reachable.

---

## 6. `[VERIFIED]` In-combat pipeline tripwire

`node scripts/qa/probe-pipeline-compile-stalls-cdp.mjs --dist dist --seconds 75`:

| build / arena | pipelines before window | **in window** | in stall | enrichment |
| :-- | --: | --: | --: | --: |
| before / atomic-acres | 375 | **1** | 0 | 0x |
| after / atomic-acres | 373 | **1** | 0 | 0x |
| before / nuketown2 | 253 | **1** | 0 | 0x |
| after / nuketown2 | 253 | **1** | 0 | 0x |

**The contract asked for 0 and the measurement is 1 — on the baseline too.** The one
creation is identical in label and timing signature across all four runs:
`renderPipeline_MeshBasicMaterial_774`, created within ~1.8 s of the player's FIRST death
(after/atomic-acres 109,318 ms vs first death 107,552 ms; before/atomic-acres 103,252 vs
103,495; after/nuketown2 89,256 vs 87,477; before/nuketown2 103,511 vs 101,742), drawn from
`_renderTransparents`, and never inside a stall.

`[VERIFIED]` It is **not** the deferred warm-up: it is present identically on the merge base
which has no scheduler at all, and it survives the section 3 fix that removed every forced
submission from the deferred path. `[OPEN]` A first-death transparent presentation
compiling one pipeline mid-match is a real pre-existing violation of the 0 contract and
needs its own lane — it is not attributable to, or fixable inside, this one.

---

## 7. `[VERIFIED]` The 12 s WebGPU fence is untouched

```
$ git diff <merge-base>...HEAD -- src/legacy-main.ts | grep -c "12_000"
0
```

The four call sites are unchanged (`src/legacy-main.ts:11096, 30022, 30082, 30108`), and the
contract that pins them still passes verbatim:

```ts
// The relief must never become a fence change: the arena still has to pass
// the same 12 s bound every other arena passes.
expect(coldWebGpuWarmFrame).not.toMatch(/flushWebGpuFrames\((?!12_000)/);
expect(source).toContain('await flushWebGpuFrames(12_000)');
```

---

## 8. Gates

```
$ npx tsc -p tsconfig.json --noEmit
TSC_EXIT=0

$ npx vitest run src/presentation-prewarm-contract.test.ts src/admission-cadence-wait.test.ts \
    src/weapon-rehearsal-scheduler.test.ts src/legacy-main-size-ratchet.test.ts
 Test Files  4 passed (4)
      Tests  46 passed (46)

$ npm run qa:pass74:arena-boot-smoke -- -g "atomic-acres|gun-range|nuketown2|WebGPU device|boot roster"
  ok 1 runs on a browser that can actually get a WebGPU device (4.8s)
  ok 2 the boot roster names every arena module on disk (60ms)
  ok 3 atomic-acres: boots a clean visible solo match (59.5s)
  ok 4 gun-range: boots a clean visible solo match (59.6s)
  ok 5 nuketown2: boots a clean visible solo match (45.1s)
  5 passed (3.0m)

$ npm run qa:stock-boot
  ok 1 launch arguments carry none of the flags that mask Tint lowering bugs (13ms)
  ok 2 stock-flag Chrome exposes a WebGPU device, or the arena boots skip by name (3.0s)
  ok 3 nuketown2: the real menu reaches a live frame with zero pipeline errors (2.1m)
  ok 4 atomic-acres: the real menu reaches a live frame with zero pipeline errors (2.1m)
  4 passed (4.3m)

$ npx vitest run          # FULL suite, quiet machine
 Test Files  1 failed | 579 passed | 1 skipped (581)
      Tests  1 failed | 5679 passed | 2 skipped (5682)
 FAIL  src/audio-music-rotation-runtime.test.ts > HF-430 runtime: the shipped ArenaAudio
       rotates the chiptune roster > plays all ten tracks before repeating any of them,
       in the runtime
 Error: Test timed out in 20000ms.
```

`[VERIFIED]` **That failure is pre-existing and is not this lane's.** The same full suite on
the merge-base worktree fails on the identical test:

```
$ cd ../aa-claude-lt-base && npx vitest run
 Test Files  1 failed | 577 passed | 1 skipped (579)
      Tests  1 failed | 5661 passed | 2 skipped (5664)
 FAIL  src/audio-music-rotation-runtime.test.ts > ... plays all ten tracks before
       repeating any of them, in the runtime
```

Run alone it passes on both builds, at 18.2 s (base) and 20.9 s (head) against a 20 s
timeout — it is a chiptune-rotation runtime test with no admission, weapon or renderer
surface, sitting on the edge of its own timeout and pushed over by full-suite load. The
timeout was **not** raised. The row stays OPEN.

---

## 9. OPEN

1. **Full suite is not 0-failed.** `src/audio-music-rotation-runtime.test.ts` times out in
   the full run on this lane AND on the merge base. Needs its own row: either the runtime
   rotation genuinely takes ~19-21 s and the test needs restructuring, or the suite's
   import cost has grown into it. Do not fix by raising `testTimeout`.
2. **In-combat pipeline count is 1, not 0, on both builds** (section 6). Pre-existing
   first-death `MeshBasicMaterial` transparent pipeline. Owner decision needed on whether
   the PASS 94 candidate ships with a known non-zero tripwire.
3. **The cadence wait delivers nothing** (section 4). Either drop it from the candidate, or
   keep it for its telemetry and open a separate lane on the real target: the admission warm
   loop presenting at ~68 ms/frame.
4. `high-seas` was in the PASS 92 attribution table but not in this lane's scope; not
   re-measured.
