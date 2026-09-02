# Lane H — faster map loads, the deep cut (compile less), second wave

Orchestrator: Claude Code (Fable 5.1), takeover record
`docs/PASS84_TAKEOVER_CLAUDE_2026-09-02.md`. This lane runs AFTER Lane A
(HF-399) has landed, on top of Lane A's branch, because both touch the
arena/perf region and Lane A's measurements are its starting point.

Worktree: `C:\Users\david\projects\aa-claude-hf399` (Lane A's), branch
`contrib/dave-gaming-pc/claude/hf399-fps-regression` continued, or a new
branch `contrib/dave-gaming-pc/claude/load-time-deep-cut` from its head.

## Owner intent
2026-08-31: "load every map much faster, wherever possible" (all arenas).
2026-09-01 23:36: on the "everything mentioned" list for PASS 84.
OMP's readback: "the fix already cut load-window compiles ~35% (580 -> 374
pipelines, 670 -> 431 modules). The real win is compiling LESS: fewer
material permutations, shared pipelines, streaming what frame one does not
need. Probe baseline is recorded; it pulls against the freeze fix if done
wrong, so it gets its own measured pass."

## Facts
- Instrument: `scripts/qa/probe-pipeline-compile-stalls-cdp.mjs --dist dist --seconds 75`
  reports pipelines and shader modules compiled before the match window and
  in combat. In-combat creations MUST stay 0 (PASS 82 invariant).
- Admission fence: `flushWebGpuFrames(12_000)`, three call sites in the
  arena transition in `src/legacy-main.ts`. Do not weaken it.
- The light set must stay frozen before the coverage fence (LightsNode
  cache key); any change that toggles lights at runtime re-invalidates
  every pipeline. Material permutations come from: light count, clip
  planes, per-material feature flags (maps, transmission, SSS terms), skin
  vs static, instancing, transparent vs opaque, side.
- Menu preview prewarm and the eight-arena boot smoke exist; the boot smoke
  passed all 8 arenas 2026-08-31 with a long timeout.
- Lane A's report and artifacts under `artifacts/qa/hf399/` are your
  baseline; read them first.

## Job
1. Measure per arena (all selectable arenas, headless real Chrome, one at a
   time, same rules as Lane A): time to menu, time to match admission,
   pipelines and shader modules compiled before admission, unique
   materials, total triangles at admission. Table it.
2. Attribute: which arenas are outliers and why (unique material count,
   permutation drivers, synchronous geometry builds, asset decode on the
   critical path, prewarm scope larger than the arena needs).
3. Cut: share materials across props with identical parameters, collapse
   permutation drivers that differ for no visual reason, move non-critical
   props behind admission (stream in after the first frame without a light
   set change), cap prewarm to what the arena actually renders. Each cut is
   its own commit with its own before/after numbers.
4. Verify after every cut: pipeline tripwire (0 in combat), the arena boot
   smoke for the touched arenas, screenshots compared to before (no visual
   regression - look at them), `npx tsc --noEmit`, focused tests.

## Boundaries
- You own: `src/rendering/arenas/**`, shared material/prewarm modules under
  `src/rendering/`, the arena-load region of `src/legacy-main.ts` with
  `// LOAD-CUT:` marks (LF preserved). Not: viewmodel, weapons, thermal,
  lobby/netcode, spawns, water constants, farcrysis (Lane C owns it).
- Machine rules as every lane: headless only, one browser, one build,
  never kill processes, no full vitest suite, explicit-path commits.

## Report
Per-arena before/after table (admission time, pipelines, modules,
materials), the cuts with commit hashes, tripwire results, screenshots
compared, and what was left uncut and why. Claim-state every line.
