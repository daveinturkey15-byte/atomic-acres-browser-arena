# Lane T — the periodic main-thread stall: root cause and fix (HF-404, the half Lane O could not close)

Orchestrator: Claude Code (Fable 5.1). Ledger row HF-404 (smooth in every
browser). This is the owner's loudest recurring ask: "no freezes ... low fps in
edge and firefox as well as chrome, i just need it smooth across all those
browsers" (2026-08-31 x2, 2026-09-01, 2026-09-02 x2).

Worktree: `C:\Users\david\projects\aa-claude-xbrowser` (Lane O's; O is finished)
Branch: continue `contrib/dave-gaming-pc/claude/hf404-cross-browser-smooth`
(rebase it onto the PASS 84 head first: `git rebase <pass84 head>`; if that
conflicts, create `contrib/dave-gaming-pc/claude/hf404-periodic-stall` from the
PASS 84 head and cherry-pick O's commits).

## What is known (read Lane O's `artifacts/lane-report.md` and `lane-verdict.md` first)
- The headless gate `scripts/qa/run-cross-browser-smooth-gate.mjs` measured
  the LIVE PASS 84 channel on 2026-09-02 15:20-15:35: Raid (test2) at CPU 45%:
  Chrome mean 77 fps, 5% low 40, 58 stalls in 120 s (29/min), period median
  1.99 s, duration median 66 ms / max 158 ms, frozen 3.5%; Edge the same shape
  (72 ms / 176 ms, 3.8%). Atomic-acres under heavier contention: 38 fps mean,
  worst 322 ms, frozen 8.75% / 4.14%. Receipts:
  `artifacts/qa/live-pass84/live-pass84/*.json` and `artifacts/qa/live-ab/*`
  in this worktree (git-ignored; copy what you cite into docs/evidence/pass85/).
- Lane O REFUTED its own first hypothesis with measurement: JS allocation churn
  is NOT the cause (0.05 MB/s allocated in combat against an 879 MB/min heap
  sawtooth; in-combat pipeline creations 0; queue backpressure and fence-walk
  ruled out). What remains: a main-thread block, 97-147 long tasks per 180 s at
  110-170 ms, matching the presented-gap series, in BOTH Chromium engines on
  ALL arenas, with a CPU profile showing 63% "idle" inside the stall and a heap
  sawtooth the JS sampler does not attribute. Both say the work is NOT in the
  sampled V8 isolate: GPU process, viz/compositor, or ArrayBuffer backing
  stores (usedJSHeapSize moves, HeapProfiler does not sample them).
- Lane O's suggested next instrument: CDP `Tracing.start` with categories
  `gpu`, `viz`, `disabled-by-default-gpu.service`, `blink.user_timing`,
  `disabled-by-default-devtools.timeline` over one 60 s atomic-acres window,
  correlated against the rAF gap series the meters already produce; plus
  external/ArrayBuffer accounting. `scripts/qa/profile-hf404-allocation-sites-cdp.mjs`
  is a working headless harness to fork (serves a sourcemapped dist, boots a
  solo match, drives the standard combat protocol, records rAF/long-task/heap).
- PASS 82 removed the light-set churn; that class is gone (tripwire 0). This is
  a different, PERIODIC class (~2 s period). Candidates worth measuring, not
  assuming: a 2 s timer in the game (telemetry flush, diagnostics recorder
  `src/match-diagnostics.ts`, leaderboard/heartbeat, replay serialisation,
  audio scheduler), GC of external memory (typed-array churn in the
  instanced fields, ghost telemetry snapshots), texture uploads, shadow-map
  re-renders on a cadence, the minimap canvas readback, `renderer.info`
  polling, or a `setInterval` that touches the DOM.
- A frame that did not present is the metric. Headless is the only allowed
  presentation (owner 12:40). The gate's 30 fps floor and 250 ms stall ceiling
  are Lane O's; do not move them.

## Job
1. Reproduce on a QUIET machine (check `nvidia-smi` and CPU; the owner's
   ComfyUI queue at `http://127.0.0.1:8188/queue` must show 0 running): one
   60 s atomic-acres window with the tracing instrument, headless Chrome,
   2560x1440 as the gate does. Correlate every presented gap over 57 ms with
   the trace: which thread, which category, which named task or timer.
   Save `docs/evidence/pass85/periodic-stall/trace-summary.json` (not the raw
   trace; summarise) and the correlation table.
2. Name the cause with numbers: period, duration, thread, the code path
   (file:line) that schedules it. If it is a timer in `src/`, find it with
   `grep -n "setInterval\|setTimeout" src/*.ts src/**/*.ts` and the trace's
   user-timing marks; add marks if you need them (`performance.mark`, cheap).
3. Fix the cause the smallest way: spread the work across frames, move it off
   the main thread, coalesce, or remove it if it is diagnostics that only QA
   reads. Mark edits `// HF-404:`. Never weaken the gate.
4. Re-run the gate on your local dist (`npm run qa:cross-browser:smooth` with
   `--arenas atomic-acres,test2 --lanes chrome,edge`) in a quiet window;
   report before/after: stalls per minute, period, duration median/max,
   frozen %, 5% low fps. The bar is Lane O's gate passing on both arenas.
5. `npx tsc --noEmit`; focused tests; commits with explicit paths.

## Boundaries
- You own: the instrument, the code path you name (once named, list it in
  the report before editing; if it lives in weapon/viewmodel or netcode,
  STOP and put the patch in the report), the gate's evidence outputs.
- Machine rules as every lane: headless only, one browser, one build, never
  kill processes you did not start, no full vitest, `--mute-audio`, 3 GB
  free VRAM before a launch, and WAIT for a quiet machine before measuring
  (the numbers are worthless otherwise; say what load each window ran at).

## Report
The named cause with the trace evidence, the fix, before/after gate table,
commits, and what remains. Claim-state every line.
