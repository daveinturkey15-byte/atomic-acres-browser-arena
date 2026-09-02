# Lane AG — the low-compute hill-climb loop: continuous refactor, streamline, improve

Orchestrator: Claude Code (Fable 5.1). Owner (2026-09-02 17:35): "ensure we
continue to refactor, streamline, work in some kind of hillclimb loop that
uses low compute to improve everything ... i want it super clean before i
start to really turn up the heat on new 3d skills and webgpu capabilities as
well as cool gameplay, artwork, physics stuff, gamemodes".

Worktree: create `C:\Users\david\projects\aa-claude-hillclimb`:
`cd C:\Users\david\projects\aa-omp-pass84 && git worktree add ../aa-claude-hillclimb -b contrib/dave-gaming-pc/claude/hillclimb-loop <current head>`
then junction `node_modules`.

## Prior art (read, reuse the ideas, do not merge it)
`C:\Users\david\projects\worktrees\light-improvement-loop-20260822` (branch
`contrib/dave-gaming-pc/codex/light-improvement-loop-20260822`, candidate
`04bc90c`, peer-accepted read-only) is a generic Hermes-harness improvement
loop with a persistent Python workbench: staged-not-installed, no scheduler.
Take from it the lease, receipt and staged-not-installed discipline. This
lane builds a SMALLER, game-specific loop that lives in the game repo.

## What the loop is
A bounded, cheap, repeatable iteration that makes the codebase measurably
better by one small step, proves it, and records it, so the shape of the
repo climbs one ratchet at a time while expensive lanes build features.

- **Worker:** the Antigravity CLI (`agy --print ... --model gemini-3.8-flash-high --effort high --dangerously-skip-permissions`;
  verify the exact model id with `agy models` and record it) - free/cheap
  compute. Fallback: Claude Sonnet via `claude -p --model sonnet`.
- **Judge (only when needed):** an Opus skeptic on batches of iterations,
  not every one.
- **Scope per iteration (exactly one):** a single file or module and a
  single metric from the backlog below. Never `src/legacy-main.ts` as a
  whole; only a marked region with a declared extraction target.
- **Metrics (ratchets, each with a committed baseline JSON and a test that
  fails if a number gets worse):**
  1. line count per file over 2,000 lines (legacy-main.ts, weapon-presentation.ts,
     test-maps.ts, map.ts, farcrysis*, map3/*);
  2. duplicate code blocks (a cheap token-shingle detector you write in
     `scripts/qa/duplicates.mjs`, roster of files derived from git);
  3. orphaned files: modules imported by nothing (`scripts/qa/find-unreachable-modules.mjs`
     exists - reuse), specs wired to nothing (Lane N's audit);
  4. hardcoded arena rosters (grep for literal arena id lists outside the
     registry) - must trend to zero;
  5. production bundle size (`dist/assets/index-*.js` bytes) and chunk count;
  6. per-frame call census on the quiet-machine probe (Lane A's instrument):
     `updateWorldMatrix`, `getObjectByProperty`, `traverse` counts per frame;
  7. type strictness debt: `any`, `as unknown as`, `@ts-ignore` counts;
  8. test wall time of the full suite.
- **Iteration protocol:** pick the top backlog item -> worker makes ONE
  change in its own worktree -> `npx tsc --noEmit` + the focused tests for
  the touched files + the ratchet test -> commit on
  `contrib/dave-gaming-pc/hillclimb/<date>-<n>` with a receipt JSON
  (metric before/after, files, tests run, model, tokens) under
  `docs/hillclimb/receipts/` -> the batch skeptic reviews N receipts ->
  the orchestrator merges accepted ones at the next build cut. A change
  that moves any other ratchet the wrong way is rejected automatically.
- **Backlog source:** `docs/hillclimb/BACKLOG.md`, seeded from Lane N's
  audit, Lane AF's leftovers, the `// TODO`s, and the metrics above;
  the loop appends what it finds.
- **Schedule:** STAGED, not scheduled, by this lane: ship the scripts
  (`scripts/hillclimb/run-iteration.ps1` and `.mjs`), the ratchet tests,
  the baseline, the backlog, and a `docs/hillclimb/README.md` with the
  exact command to run one iteration and the exact command to install the
  hourly Task Scheduler job. Run THREE iterations yourself under
  supervision and commit their receipts. The owner turns the scheduler on
  after reading them (record that boundary in the README).
- **Safety:** the worker never touches gates, thresholds, tests' expected
  values, provenance, publish scripts or the ledger; never adds a
  dependency; never opens a browser (the census metric is measured by the
  orchestrator's quiet-window runs, not by the worker); one worktree, one
  branch per iteration; explicit-path commits; every receipt names the
  model and cost.

## Job
1. Baseline: measure the eight metrics on the current head; commit
   `docs/hillclimb/baseline.json` and the ratchet test that reads it.
2. Scripts: iteration runner, duplicate detector, roster-literal detector,
   receipt writer, backlog seeding from Lane N's audit and the TODO scan.
3. Three supervised iterations (agy worker), each a separate commit with a
   receipt; show the ratchet moving.
4. README with the run and install commands; `npx tsc --noEmit`; focused
   tests; commits with explicit paths.

## Boundaries
- You own: `scripts/hillclimb/**`, `docs/hillclimb/**`, the ratchet test,
  the duplicate/roster detectors under `scripts/qa/`. The three iterations
  may touch any non-gate source file within the protocol above.
- Machine rules as every lane; no browsers.

## Report
Baseline table, the three iterations' receipts (metric deltas), the install
command, what the worker refused or got wrong, commits. Claim-state every line.
