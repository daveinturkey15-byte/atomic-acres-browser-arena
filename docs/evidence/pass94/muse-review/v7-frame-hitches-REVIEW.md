# Muse review — v7-frame-hitches (third eyes, QA-only lane)

Scope: `docs/evidence/pass95/frame-hitches/REPORT.md` + diff
`origin/contrib/dave-gaming-pc/claude/pass93-candidate...HEAD`
(6 files: `scripts/qa/frame-hitch-attributor.mjs` 660 lines,
`package.json` 1-line script, `REPORT.md`/`before.json`/`before.md`/`before-final.png`).
Branch `contrib/dave-gaming-pc/claude/v7-frame-hitches`, worktree
`C:/Users/david/projects/aa-v-frame-hitches`.
No builds, no browser, no GPU run by this reviewer — all numbers below are
recomputed from `before.json` or read from the script source.
Per finding: file:line, why, smallest fix.

## Verifier-issue rechecks (independent)

### V1 — CONFIRMED: run is not on stock flags — REPORT.md:32-34, script:51, script:348-354

`REPORT.md:33` claims "stock flags plus `--mute-audio` and an off-screen
`--window-position`". `frame-hitch-attributor.mjs:351-354` actually passes:
`--enable-unsafe-webgpu`, `--ignore-gpu-blocklist`,
`--disable-frame-rate-limit`, `--disable-gpu-vsync`,
`--enable-precise-memory-info`, plus three backgrounding/throttling disables.
Only the vsync pair is disclosed, and only later at `REPORT.md:68`
("frame COST, not a vsync cap"). The two WebGPU-eligibility flags are
disclosed nowhere, and the task record for this machine holds that
`--enable-unsafe-webgpu` masks a deterministic three-r185 Chrome WebGPU bug —
so this run does not measure the owner's browser configuration. The
`--disable-gpu-vsync` / `--disable-frame-rate-limit` pair additionally replaces
the present path that the headline `unattributed-present` bucket (368.6 ms)
blames. The same "stock flags" claim is repeated in-code at `script:50-51`
CONTRACT NOTES.
Smallest fix: disclose the full flag list in `REPORT.md` Method *and* fix
`script:50-51`; default the script to stock Chrome flags and put the current
set behind an explicit opt-in (e.g. `--fast` / `--nonstock`), recording
`chrome --version` in the JSON. Any rerun cited as release evidence uses stock.

### V2 — CONFIRMED: PASS73_NATIVE_WEBGPU=1 claim is false — REPORT.md:32-33

`REPORT.md:33` lists `PASS73_NATIVE_WEBGPU=1` as part of the method. The
script contains zero `PASS73` occurrences and zero `process.env` reads
(grep over the script: no hits), so the variable is never read and cannot
have altered the run. Provenance claim with no mechanism.
Smallest fix: delete the claim from `REPORT.md:33`, or actually implement it
(read `process.env.PASS73_NATIVE_WEBGPU` and gate the `renderer=webgpu`
URL param / backend selection on it), with a grep-guarantee in review.

### V3 — CONFIRMED: GC trace categories missing, GC map is dead code — script:327-338, script:412-429

`TRACE_CAUSE` at `script:335-338` maps `MajorGC`/`MinorGC`/`V8.GCFinalizeMC`/
`BlinkGC.AtomicPhase` to `gc-major`/`gc-minor`, but `script:427`
`includedCategories` is only
`['devtools.timeline', 'blink.user_timing', 'disabled-by-default-devtools.timeline']` —
no `disabled-by-default-v8.gc`, no `blink.gc`. Those trace events are never
emitted, so no collection can ever be attributed. Recomputed from
`before.json`: the 1445/1446/1447 triple is 55.2 + 70.2 + 52.8 = 178.2 ms of
the 718.6 ms hitch total = 24.8% (~25%), and frame 1446 carries jsMs 23.9
(the only hitch frame with JS > 7.2 ms) plus heapDelta −91.1 MB yet is charged
wholly to `unattributed-present` 46.3 ms. The lane's headline (hitches are
GPU/present-side, not main-thread) therefore rests partly on a bucket that
contains an un-attributable major collection. Secondary: `script:419` drops
all trace events with `dur < 400`µs, which can discard GC sub-events even
after the categories are fixed.
Smallest fix: add the GC categories to `script:427` (verify exact strings
against the installed Chrome's `about:tracing` — `disabled-by-default-v8.gc`
at minimum), exempt GC causes from the 400µs floor or lower it for them,
rerun, and restate the 1445–1447 triple before citing the GPU/present
conclusion.

### V4 — CONFIRMED: cause table explains 59.9%, reads as 100% — script:553-589, before.json

`script:576` charges `unattributed-present` only `if (causes.length === 0)`.
Frames with a partial charge (121, 208, 719, 1723) leave their remainder
unreported — there is no residual row and no `unattributed-js` unless
`jsMs − accounted > HITCH_MS*0.5` (= 25 ms, `script:572`). Recomputed:
causeTable sums to 430.8 ms against `hitches.totalMs` 718.6 ms → 59.9%
explained, 287.8 ms (40.1%) silently absent. A reader sums the table against
the total and believes the instrument closed the budget.
Smallest fix: add an explicit residual row per hitch frame
(`unaccounted-residual = frameMs − Σcharged − (jsMs outside hooks, if any)`),
or at minimum print "accounted X / 718.6 ms (Y%)" under the table in both
`before.md` and `REPORT.md`. One-line-adjacent change in `script:570-581`.

### V5 — CONFIRMED, honestly stated: no src/ change, no "after" — diff file list

Diff is exactly 6 files: `REPORT.md`, `before.json`, `before.md`,
`before-final.png`, `package.json` (1 script line), `frame-hitch-attributor.mjs`.
Zero `src/`, zero config. Nothing here fixes the owner's Nuke Town freezes
and there is no "after" table; `REPORT.md:23-28` and the Honest-limits section
say so plainly. Not a defect — record as OPEN.
Smallest fix: none in this lane; require the fix lane to publish its
after-run with the same script + route + flags before claiming improvement.

### V6 — CONFIRMED: solo-only harness, MP unmeasured — script:377-408

Drive path is `#solo` waits (`script:382,394`), `selectArena` + `startSolo`
(`script:403-404`), `matchPhase === 'active' && gameStarted`
(`script:405-408`). No hosted/guest, no PeerJS path, no 120 ms RTT / 1% loss
soak shape. `REPORT.md` never scopes the title claim to solo. A future fix
validated only by `npm run qa:hitches` can be green while MP guests chop.
Smallest fix: scope `REPORT.md` title + Method to "solo bot match, 4 live
bots"; add an explicit non-goal line ("does not cover multiplayer; MP
regressions stay with `qa:mp-soak`"); optionally add a `--mode` stub that
refuses non-solo values so a later MP arm is a deliberate diff.

## New findings (what the verifier did not check)

### N1 — Observer effect unmeasured; counts stand, ms needs a bound — script:154-171, 188-207, 262-308, 290, 352, 412-429

Mechanism, read from source: `timed()` (`script:154-166`) wraps each hooked
API with two `performance.now()` calls + counter/byte accounting; `counted()`
(`script:167-171`) is a single increment with no timing. Consequences:

- `submits` (98,353; 26.2/frame) and `passes` (95,426; 25.4/frame) go through
  `counted()` (`script:197-198`) — counts are app-real, undistorted, and carry
  no ms claim. The 25-pass/26-submit census is NOT self-inflicted.
- `writeBuffer` (1,246,396; 332.3/frame) goes through `timed()`
  (`script:188-191`): the count is app-real, but `writeBufferMs` 3,185.3 ms
  total (0.85 ms/frame) includes wrapper overhead. Bound, not measured:
  1.246M calls × ~2 `now()` calls — even at 200 ns/call ≈ 0.25 s over 90 s
  (≈ 0.07 ms/frame), under a tenth of reported `writeBufferMs`. Small but
  never subtracted or bounded in the report.
- Worst frame 1723 (the 116.6 ms max): 957 `writeBuffer` calls charged
  1.6 ms (`before.json`), i.e. 1.4% of the frame — the hitch is not the
  instrument, and the report's suspicion of the upload path must lean on
  driver-side cost, not the 1.6 ms. The report does say this ("plus the
  driver-side cost that lands on the GPU timeline", `REPORT.md:158-160`) —
  credit; but without an unhooked baseline the split is asserted, not shown.
- Unbounded overheads the report never names: per-frame `performance.memory`
  read (`script:290`, made precise-costly by `--enable-precise-memory-info`,
  `script:352`), per-frame `Object.keys + spread` delta copy over ~25
  counters (`script:285-289`), a `MessageChannel` round trip per frame
  (`script:265-304`), and CDP `recordAsMuchAsPossible` tracing
  (`script:426`). Any of these can shift the very tail being measured.
- Latent sampler bug: `pendingFrame` is a single slot (`script:266-268`);
  if two rAF ticks land before the channel fires, the earlier frame keeps
  `jsMs: null` and falls into the `jsMs ?? 0` path at `script:577-578`.
  No null-`jsMs` hitch frame appears in `before.json`, so untriggered here —
  fix before it bites a slower box.
Smallest fix: add `--no-hooks --no-trace` (or `--census-only`) baseline arm,
run it on the same route, and report the p50/delta; bound or subtract the
`timed()` wrapper cost; convert `pendingFrame` to a FIFO keyed by frame
index; document the `precise-memory` + tracing perturbation in Method.

### N2 — Sampling-window integrity: COST distribution, not experienced frames — script:402-411, 435-462, 498-500, 594-600

- Window starts the moment the match turns active (`script:460-462`
  immediately after `script:405-410`); the only exclusion is frame `i > 0`
  (`script:498`). No warm-up / cold-admission exclusion — spawn, bot join,
  shader warm-up and the first teleport all count toward p50/p95/p99
  (`script:594-600`, `percentile` over raw callback intervals).
- `frameMs = startMs − previousStart` (`script:291-296`): any rAF gap the
  page coalesced or dropped (headless throttle, occlusion, long task) is
  recorded as one long frame. Dropped frames are not counted as dropped.
- The route itself injects work: `teleportPlayer` every 6 s and a yaw
  teleport every 700 ms (`script:435-458`) run *during* sampling. Teleports
  force pipeline/alloc/upload spikes no player merely walking would see;
  teleport-adjacent frames are not marked or excluded.
- `--disable-gpu-vsync --disable-frame-rate-limit` (`script:352`) mean the
  published p50 23.2 / p95 32.9 / p99 40.3 / p99.9 65.5 are a frame-COST
  distribution in headless Chrome, not the vsync'd frames a headed player
  experiences. `REPORT.md:68-70` discloses COST-vs-cap honestly — but the
  headline table (`REPORT.md:73-89`) still invites direct comparison with the
  candidate-7 rung (spawn pose, bots frozen, headed) without a
  comparability warning beyond one paragraph.
- `deployMs` 89,319 ms (`before.json`) vs the candidate-7 report's 24,065.5 ms
  cold transition (`REPORT.md:246-250`) is recorded but unexplained; combined
  with undisclosed per-run GPU load (ComfyUI on the same box,
  `REPORT.md:260-261`) the run is a single sample with two unexplained
  environment deltas.
Smallest fix: skip the first 10–15 s / first K frames after `S.start()`,
log teleport timestamps into the frame stream and mark teleport-adjacent
hitches, count coalesced gaps separately from long frames, and label the
percentile table "headless cost (vsync off), solo, teleported route" —
not player-experienced frames. Record per-run GPU contention.

### N3 — Trace-to-frame charging is start-biased — script:502-530

`frameForTraceEvent` (`script:503-518`) charges each trace event wholly to
the frame containing its *start* timestamp; a multi-frame `GPUTask` or paint
spanning a hitch boundary credits only the first frame, and events that
start outside every frame window are dropped silently. With only 2
`gpu-task` charges in the table, a spanning GPU stall could be mis-split.
Smallest fix: split event ms across overlapped frames pro-rata (or document
start-charging as a known limitation); log dropped-event ms.

### N4 — Blast radius: clean, QA-only — diff file list, package.json:221

Confirmed: 6 added files, no modification to any existing source, config,
gate, budget, fence, or CI path. `package.json:221` appends one script
(`qa:hitches`) with a trailing comma; no dependency added or bumped
(`@playwright/test`, the script's only import, is pre-existing). No
`.github/`, `vite`/`playwright`/threshold file touched; repo-wide grep for
`qa:hitches` hits only `package.json` and the new `REPORT.md`. The new
script cannot alter an existing gate by import — it runs only when invoked.
No fix needed; keep it that way (do not wire `qa:hitches` into any gate or
CI until V1–V4 + N1–N2 are closed and a stock-flags baseline exists).

## Verdict: SHIP-WITH-FIXES

1. Blast radius is zero — scripts + docs only, no runtime/config/gate
   impact (N4), and the lane honestly reports no fix and no "after" (V5).
   Safe to land as QA tooling; nothing here can regress the game.
2. The headline measurement cannot be cited as release evidence as written:
   non-stock flags undisclosed (V1), a phantom env var (V2), 25% of hitch
   time sitting in a bucket that cannot see GC (V3), and a table that
   explains 59.9% while reading as 100% (V4), on a solo-only, teleported,
   vsync-off sample (V6, N2) with unmeasured instrument overhead (N1).
3. Every fix is small, mechanical, and falsifiable by rerun: disclose/lock
   flags, delete-or-implement PASS73, add two trace categories, print the
   residual row, scope to solo, add a baseline arm + warm-up skip. Land the
   lane, file the fixes against it, and bar `qa:hitches` numbers from any
   acceptance manifest until the rerun.
