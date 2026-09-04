# PASS 94 publication attempt — BLOCKED

Date: 2026-09-04 (Europe/London). Machine: `dave-gaming-pc`. Harness: Codex Luna 5.6.
Worktree: `C:\Users\david\projects\aa-claude-hitl`.
Branch: `contrib/dave-gaming-pc/claude/pass93-candidate`.
Candidate cut: `8d6b41f241cc3533f12fdf6a9f15e0499ea0f99e`.

## Decision

`BLOCKED` — the required standalone HF-477 Nuke Town pipeline-budget gate could not
produce a green result in this run because the machine remained at 100% CPU under an
owner workload. Publication stopped before the build-last gate, dry-run publisher, real
publisher, GitHub Pages mutation, and live checks. No threshold, timeout, assertion or
fence was changed, and production was not touched.

## Claim states and reconciliation

- `CLAIMED`: Dave played HITL candidate 5 at head `3e2fd273`, served on `:4300` by pid
  `1608`, and approved it at 2026-09-04 19:20: “this version is good now ... lets get
  it live on github and at the front of the menu”. This run did not perform a new
  subjective review.
- `VERIFIED`: `origin/contrib/dave-gaming-pc/claude/map-order-hf495` exists at
  `09980a5a3c58fd70c980be4056e3cefbee872d5d`; it is already an ancestor of this
  worktree, so no merge was needed.
- `VERIFIED`: `origin/contrib/dave-gaming-pc/claude/hf496-rebuild-card-fix` was absent
  from `git ls-remote`; no conditional HF-496 merge was attempted. The ledger describes
  HF-496 as the stale-browser-tab check, not a real shipped defect.
- `VERIFIED`: the current commit contains the already-applied PASS 93 → PASS 94 cut,
  including PASS 94 identity, `channels/pass94`, the sole `PASS 93` backup, changelog,
  publisher, plan contract and `docs/pass94-outside-ownership.patch`. A second roll was
  not run because the release key was already advanced and rerolling would be a second
  cut rather than the requested continuation.
- `VERIFIED`: the worktree was clean before the fresh gates; `3e2fd273` and the HF-495
  branch tip are ancestors of the current head. High performance power plan was active.
- `VERIFIED`: pid `1608` remained the existing Vite preview process. It was not restarted
  or killed. A listener check did not report port 4300 at the initial probe, but no action
  was taken against the process.
- `VERIFIED`: the native AKP adoption check reported trusted Codex on dave-gaming-pc.
  The prescribed audit-row pass condition held: audit emitted no failure/amber line for
  Codex on dave-gaming-pc. The global audit remains red for unrelated harness rows.

## Fresh gate transcript

### TypeScript

```text
$ npx tsc --noEmit
[no stdout/stderr]
Exit code: 0
```

### Release tests

```text
$ npx vitest run src/changelog.test.ts src/release-topology.test.ts src/release-pipeline.test.ts src/release-channel.test.ts src/release-change-impact.test.ts src/release-benchmark.test.ts src/pass73-start-benchmark.test.ts src/acceptance-gate.test.ts src/pr-preview-provenance.test.ts src/project-map.test.ts src/pass65-release-foundation-evidence.test.ts --reporter=dot

 RUN  v4.1.9 C:/Users/david/projects/aa-claude-hitl

·······················································································

 Test Files  11 passed (11)
      Tests  127 passed (127)
   Start at  21:32:27
   Duration  1.63s (transform 1.66s, setup 0ms, import 2.20s, tests 661ms, environment 1ms)

Exit code: 0
```

### Publish-plan contract

```text
$ git add -- docs/pass94-outside-ownership.patch; node --test scripts/orchestration/publish_pass94_plan.test.mjs
✔ the plan deletes every tree except pass93, keeps pass93, adds pass94, and the post-state is exactly {pass93, pass94} (5551.7502ms)
✔ the chooser carries exactly two cards, keyed for the shell aliases: experimental -> PASS 94 live, previous -> PASS 93 backup (3839.1536ms)
✔ the in-build fallback (src/bootstrap.ts via release-channels.json) resolves to channels/pass93 (4017.6347ms)
✔ the dry run writes, deletes and renames nothing in the gh-pages tree (6592.8074ms)
✔ refuses when the pass93 backup is not on gh-pages to be pinned, and plans no deletions (3642.4101ms)
✔ rollback re-points the default at PASS 93, keeps PASS 94 as the previous card, deletes nothing, needs no build (243.7334ms)
✔ rollback refuses when gh-pages is not already exactly {pass93, pass94} (156.0092ms)
✔ exit code is 2 while any guard is red and 0 only when every guard is green (4288.3056ms)
✔ the outside-ownership patch is tracked and either applies cleanly or is already applied (588.6393ms)
ℹ tests 9
ℹ suites 0
ℹ pass 9
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 29040.694

Exit code: 0
```

### HF-477 pipeline-budget prerequisite and attempt

```text
$ rg --files src | rg -i 'pipeline.*budget|budget.*pipeline'
src\farcrysis-webgpu-pipeline-budget.test.ts
src\nuketown2-pipeline-budget.test.ts

$ (Get-CimInstance Win32_Processor).LoadPercentage
100
```

The unchanged standalone command was then attempted as required:

```text
$ npx vitest run src/nuketown2-pipeline-budget.test.ts --reporter=dot
Exit code: 124 (command bound exceeded; no usable Vitest stdout/stderr was returned)
```

`VERIFIED`: after the attempt, the matching child processes had exited, but no test
result was available to classify as green or red. Repeated CPU observations remained at
100% (the owner `bf6` process was observed as the dominant workload); the mandated
under-70% rerun condition was never reached. This is an unresolved required gate, not a
pass and not permission to extend the test timeout.

## Stopped work

Because HF-477 had no fresh green standalone result, these required steps were not run:

- the full Vitest suite and the required standalone audio-music-rotation-runtime rerun;
- `npm run build` as the final build-time gate;
- PASS 94 identity grep, `dist-pass94` recopy, release-identity QA and freshness guard;
- native-WebGPU 13/13 boot smoke and stock-flag arena boot (including the first-card
  `nuketown2` assertion);
- `python scripts/orchestration/publish_pass94.py --dry-run` and the real publisher;
- GitHub Pages channel/root/release-index/identity checks and the live stock-flag probe.

`OPEN`: no PASS 94 live URL exists because publication was not performed.

## Candidate scope and deferred PASS 95

`VERIFIED` source scope retained in the cut: approved candidate 5 at `3e2fd273`, HF-495
map order at `09980a5a` (Nuke Town Rebuild first, old Raid retired, Raid 2 preview near
the top), PASS 93 Chrome 153 hardening, killstreak tuning, bot/spawn, minimap, vehicle,
audio and menu work.

`CLAIMED` deferred to PASS 95 per the release request: perf lane 3, roadside bays, Nuke
horizon, sound redesign, rooflines/stairs, circular turning head, liveried vehicles and
clustered lighting.

## Final status

`CODEX-PASS94-BLOCKED` — required gate unresolved: standalone
`src/nuketown2-pipeline-budget.test.ts` HF-477 could not produce a result under persistent
100% CPU; no publication was attempted.
