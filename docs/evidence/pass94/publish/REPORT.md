# PASS 94 publication attempt — BLOCKED

Date: 2026-09-04. Machine: `dave-gaming-pc`. Harness: Codex Luna 5.6.
Worktree: `C:\Users\david\projects\aa-claude-hitl`.
Branch: `contrib/dave-gaming-pc/claude/pass93-candidate`.
Candidate head: `09980a5a3c58fd70c980be4056e3cefbee872d5d`.

## Decision

`BLOCKED` — publication was stopped before build, browser gates, dry-run publication,
real publication, or live checks because `src/nuketown2-pipeline-budget.test.ts` timed
out in isolation in two required tests. No gate was weakened and no publish command was
run.

## Claim states and reconciliation

- `CLAIMED`: the owner's direct instruction records that Dave played HITL candidate 5,
  head `3e2fd273`, served on `:4300` by pid `1608`, and approved it at 2026-09-04
  19:20: “this version is good now ... lets get it live on github and at the front of
  the menu”. This run did not perform a new subjective owner review.
- `VERIFIED`: the pushed HF-495 branch
  `origin/contrib/dave-gaming-pc/claude/map-order-hf495` points at `09980a5a`, which
  is the current HEAD and is already an ancestor; no merge was needed.
- `VERIFIED`: `git ls-remote` found no
  `origin/contrib/dave-gaming-pc/claude/hf496-rebuild-card-fix` ref, so no HF-496 merge
  was attempted. The existing ledger describes HF-496 as a stale-browser-tab check;
  no no-op fix was merged.
- `VERIFIED`: the PASS 94 roll edits left by the interrupted run were inspected and
  retained as the deterministic PASS 93 → PASS 94 cut: PASS 94 identity, `channels/pass94`,
  sole `PASS 93` backup, changelog entry, topology pins, publisher script/test, and
  `docs/pass94-outside-ownership.patch`.
- `VERIFIED`: pid `1608` was still present at 21:13:56; this run did not restart or kill
  `:4300`.

## Fresh gate transcript

The following outputs are from this continuation. Empty output is explicitly recorded.

```text
$ npx tsc --noEmit
[no stdout/stderr]
Exit code: 0
```

```text
$ npx vitest run src/changelog.test.ts src/release-topology.test.ts src/release-pipeline.test.ts src/release-channel.test.ts src/release-change-impact.test.ts src/release-benchmark.test.ts src/pass73-start-benchmark.test.ts src/acceptance-gate.test.ts src/pr-preview-provenance.test.ts src/project-map.test.ts src/pass65-release-foundation-evidence.test.ts --reporter=dot

 RUN  v4.1.9 C:/Users/david/projects/aa-claude-hitl

·······························································································································

 Test Files  11 passed (11)
      Tests  127 passed (127)
   Start at  21:05:19
   Duration  2.10s (transform 1.62s, setup 0ms, import 2.51s, tests 1.17s, environment 2ms)

Exit code: 0
```

```text
$ git add -- docs/pass94-outside-ownership.patch; node --test scripts/orchestration/publish_pass94_plan.test.mjs
✔ the plan deletes every tree except pass93, keeps pass93, adds pass94, and the post-state is exactly {pass93, pass94} (5533.8965ms)
✔ the chooser carries exactly two cards, keyed for the shell aliases: experimental -> PASS 94 live, previous -> PASS 93 backup (2732.3797ms)
✔ the in-build fallback (src/bootstrap.ts via release-channels.json) resolves to channels/pass93 (5143.2808ms)
✔ the dry run writes, deletes and renames nothing in the gh-pages tree (6741.8765ms)
✔ refuses when the pass93 backup is not on gh-pages to be pinned, and plans no deletions (9606.326ms)
✔ rollback re-points the default at PASS 93, keeps PASS 94 as the previous card, deletes nothing, needs no build (1660.8331ms)
✔ rollback refuses when gh-pages is not already exactly {pass93, pass94} (2333.2161ms)
✔ exit code is 2 while any guard is red and 0 only when every guard is green (6832.6148ms)
✔ the outside-ownership patch is tracked and either applies cleanly or is already applied (749.3973ms)
ℹ tests 9
ℹ suites 0
ℹ pass 9
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 41518.395

Exit code: 0
```

```text
$ npx vitest run

 RUN  v4.1.9 C:/Users/david/projects/aa-claude-hitl

 ❯ src/nuketown2-pipeline-budget.test.ts (5 tests | 1 failed) 39140ms
     × builds many node materials but only a bounded number of graphs 23944ms
 ❯ src/audio-music-rotation-runtime.test.ts (8 tests | 1 failed) 52861ms
     × plays all ten tracks before repeating any of them, in the runtime 30763ms
 ❯ src/gameplay-state-property.test.ts (2 tests | 1 failed) 64942ms
     × replays every generated sequence to the same canonical hash 63365ms

 Test Files  3 failed | 599 passed | 1 skipped (603)
      Tests  3 failed | 6069 passed | 2 skipped (6074)
   Start at  21:06:41
   Duration  181.45s (transform 446.60s, setup 0ms, import 834.19s, tests 1002.20s, environment 91ms)

(node:12744) ExperimentalWarning: SQLite is an experimental feature and might change at any time

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 3 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/audio-music-rotation-runtime.test.ts > HF-430 runtime: the shipped ArenaAudio rotates the chiptune roster > plays all ten tracks before repeating any of them, in the runtime
Error: Test timed out in 20000ms.
If this is a long-running test, pass a timeout value as the last argument or configure it globally with "testTimeout".
 ❯ src/audio-music-rotation-runtime.test.ts:368:3
     366|   });
     367|
     368|   it('plays all ten tracks before repeating any of them, in the runtim…
       |   ^
     369|     const { audio, context } = startMusic(31_337);
     370|     // Ten tracks at ~90 s each; run past a full cycle and into the ne…

 FAIL  src/gameplay-state-property.test.ts > generated gameplay-state sequences (10000 runs) > replays every generated sequence to the same canonical hash
Error: Test timed out in 60000ms.
If this is a long-running test, pass a timeout value as the last argument or configure it globally with "testTimeout".
 ❯ src/gameplay-state-property.test.ts:83:3
     81|   }, propertyTimeoutMs);
     82|
   83|   it('replays every generated sequence to the same canonical hash',…
       |   ^
     84|     fc.assert(
     85|       fc.property(fc.string({ minLength: 1, maxLength: 24 }), fc.array…

 FAIL  src/nuketown2-pipeline-budget.test.ts > HF-477 nuketown2 WebGPU pipeline budget — the arena > builds many node materials but only a bounded number of graphs
Error: Test timed out in 20000ms.
If this is a long-running test, pass a timeout value as the last argument or configure it globally with "testTimeout".
 ❯ src/nuketown2-pipeline-budget.test.ts:230:3
     228| });
     229|
     230| describe('HF-477 nuketown2 WebGPU pipeline budget — the arena', () => {
     231|   it('builds many node materials but only a bounded number of graphs',…
     232|     const rows = arena();
     233|     const distinct = new Set(rows.map((row) => row.key));

Exit code: 1
```

```text
$ npx vitest run src/audio-music-rotation-runtime.test.ts --reporter=dot

 RUN  v4.1.9 C:/Users/david/projects/aa-claude-hitl

········

 Test Files  1 passed (1)
      Tests  8 passed (8)
   Start at  21:10:07
   Duration  27.42s (transform 1.46s, setup 0ms, import 1.90s, tests 24.60s, environment 0ms)

Exit code: 0
```

```text
$ npx vitest run src/nuketown2-pipeline-budget.test.ts --reporter=dot

 RUN  v4.1.9 C:/Users/david/projects/aa-claude-hitl

··xx·

 Test Files  1 failed (1)
      Tests  2 failed | 3 passed (5)
   Start at  21:10:50
   Duration  47.11s (transform 1.76s, setup 0ms, import 2.29s, tests 44.29s, environment 0ms)

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 2 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/nuketown2-pipeline-budget.test.ts > HF-477 nuketown2 WebGPU pipeline budget — the arena > builds many node materials but only a bounded number of graphs
Error: Test timed out in 20000ms.
If this is a long-running test, pass a timeout value as the last argument or configure it globally with "testTimeout".
 ❯ src/nuketown2-pipeline-budget.test.ts:230:3
     228| });
     229|
     230| describe('HF-477 nuketown2 WebGPU pipeline budget — the arena', () => {
     231|   it('builds many node materials but only a bounded number of graphs',…
       |   ^
     232|     const rows = arena();
     233|     const distinct = new Set(rows.map((row) => row.key));

 FAIL  src/nuketown2-pipeline-budget.test.ts > HF-477 nuketown2 WebGPU pipeline budget — the arena > shares one graph across the roles that differ only by colour
Error: Test timed out in 20000ms.
If this is a long-running test, pass a timeout value as the last argument or configure it globally with "testTimeout".
 ❯ src/nuketown2-pipeline-budget.test.ts:260:3
     258|   });
     259|
     260|   it('shares one graph across the roles that differ only by colour', (…
       |   ^
       |   ^

Exit code: 1
```

```text
$ npx vitest run src/gameplay-state-property.test.ts --reporter=dot

 RUN  v4.1.9 C:/Users/david/projects/aa-claude-hitl

··

 Test Files  1 passed (1)
      Tests  2 passed (2)
   Start at  21:12:16
   Duration  45.76s (transform 1.24s, setup 0ms, import 1.42s, tests 41.60s, environment 0ms)

Exit code: 0
```

## Stopped work

Because the isolated HF-477 timeout is a red required gate, the following were not run:

- `npm run build` (required to be last among build-time gates)
- `grep -l "PASS 94" dist/assets/release-identity-*.js`
- `rm -rf dist-pass94 && cp -r dist dist-pass94`
- `npm run qa:release-identity`
- the artifacts freshness guard
- 13/13 native-WebGPU boot smoke
- `npm run qa:stock-boot` against a new build
- `python scripts/orchestration/publish_pass94.py --dry-run`
- the real publisher
- GitHub Pages channel/root/release-index/identity checks
- the live PASS 94 stock-flag probe

`OPEN`: no PASS 94 live URL exists because publication did not occur.

## Candidate scope and deferred PASS 95

`VERIFIED` in the retained cut: approved candidate 5 content at `3e2fd273` plus the
HF-495 map-selection order correction at `09980a5a` (Nuke Town Rebuild first, old Raid
retired, Raid 2 preview near the top), PASS 93 Chrome 153 hardening, killstreak tuning,
bot/spawn, minimap, vehicle, audio, and menu work. This is source scope only; it was not
published.

`CLAIMED` deferred to PASS 95 per the release request: perf lane 3, roadside bays, Nuke
horizon, sound redesign, rooflines/stairs, circular turning head, liveried vehicles, and
clustered lighting.

## Final status

`CODEX-PASS94-BLOCKED` — red gate: isolated
`src/nuketown2-pipeline-budget.test.ts` HF-477, two tests timed out at the unchanged
20,000 ms test timeout.
