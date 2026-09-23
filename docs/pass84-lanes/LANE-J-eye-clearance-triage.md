# Lane J — eye-clearance RED spots: triage and fix, never re-baseline

Orchestrator: Claude Code (Fable 5.1). Owner 2026-09-02 08:40: "sort all of
this too".

Worktree: `C:\Users\david\projects\aa-claude-eyeclear`
Branch: `contrib/dave-gaming-pc/claude/eye-clearance-triage` (base 7a083e48)

## Facts (2026-08-31)
- 55 eye-clearance clip spots on gun-range and 6 on skyline-terminal were
  deliberately left RED. The OLD ceilings were measured by a probe that sat
  0.75 m underground, so they are not comparable: the previous session's
  instruction was "triage, don't raise". That instruction stands: no
  threshold, ceiling or baseline goes up to make a spot green.
- The gate: `npm run qa:eye-clearance` (contract test, then
  `scripts/qa/sweep-eye-clearance-spots.ts`, then the runtime verifier
  `scripts/qa/verify-eye-clearance-runtime.mjs` behind a preview server).
  Read all three before running anything. A hardcoded arena roster in an
  earlier version of this sweep went green while never looking at the
  newest arenas; the roster must come from the registry.
- The eye-clearance ceiling ratchet was tightened 24 -> 9 on 2026-08-29.

## Job
1. Run the sweep once to get the current RED list with coordinates and
   measured clearance per spot. Save `artifacts/qa/eye-clearance/before.json`.
2. Triage EVERY red spot into exactly one of: (a) real geometry clip a player
   can experience (fix the geometry or collider so the eye has clearance),
   (b) probe artefact (the probe samples a point a player cannot stand at,
   or below the floor: fix the PROBE so it samples reality, with a test that
   proves the old artefact case now reports correctly), (c) intentional
   crawl space (document it in the spot table with why, keep it red-exempt
   only via a named per-spot annotation that the sweep prints, never via a
   raised ceiling).
3. Fix (a) and (b). For each fixed spot, headless screenshot from the eye
   position before and after under `artifacts/qa/eye-clearance/`.
4. Re-run the sweep; the report must show every previously-red spot as
   green, fixed-probe, or annotated, with zero ceiling changes (diff the
   sweep config to prove it).
5. `npx tsc --noEmit`; focused tests; commit per group with explicit paths.

## Boundaries
- You own: gun-range and skyline-terminal geometry/collider files for the
  spots, the eye-clearance sweep and verifier scripts and their contract
  tests, spot annotations.
- Do NOT touch: spawn layouts (Lane D), viewmodel clip (Lane B), atomic-acres
  lawn/perf (Lane A), farcrysis (Lane C), lobby/netcode.
- Machine rules: headless only, one browser, one build, never kill
  processes, never the full vitest suite, 3 GB free VRAM before a launch.

## Report
Table: spot, arena, before clearance, class (a/b/c), fix, after clearance,
evidence path. Prove no ceiling changed. Commits. Claim-state every line.
