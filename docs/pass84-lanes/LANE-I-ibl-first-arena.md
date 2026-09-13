# Lane I — IBL first-arena lighting bug: make map 1 light like map 2 (owner: "sort it")

Orchestrator: Claude Code (Fable 5.1). Owner 2026-09-02 08:40: "sort all of
this too" — the decision that was waiting is now yours to make WITH EVIDENCE.

Worktree: `C:\Users\david\projects\aa-claude-ibl`
Branch: `contrib/dave-gaming-pc/claude/ibl-first-arena` (base 7a083e48)

## The defect (measured 2026-08-31, full write-up in the repo)
READ `docs/IBL_FIRST_ARENA_BUG_2026-08-31.md` IN FULL first. Summary:
`scene.environment` is null on the FIRST arena of every page load and applied
on every map after it, so the same build lights map 1 differently from map 2.
Root cause is one branch at (then) `src/legacy-main.ts:3989`. Switching it on
moves eight approved arenas +4-7% mean luminance with >50% of pixels
changing, and it is coupled to `metalness: 0` decisions the art pass made on
the premise it stays null. The doc names the exact fix shape and the gate to
land with it.

## Decision rule
The owner approved the arenas by PLAYING them, i.e. mostly as map 2+ (with the
environment applied) but also as the first map of a session. The invariant
that matters is: first load and later loads render identically. Choose the
target look by evidence: capture each arena both ways (first-load vs
subsequent) headless, compare against the approved PASS 81 art captures where
they exist (`artifacts/qa/artstyle-overhaul/` or the docs the write-up cites),
and pick the variant closest to what shipped and was praised. Then make the
other path match it. If that means applying the environment on first load and
re-tuning `metalness`/grade constants so the eight arenas return to their
approved luminance (within ~1%), do that, per arena, with numbers.

## Job
1. `npm run build`; capture per arena: first-load frame and second-load frame
   (same camera, same time), mean luminance and a pixel-diff percentage.
   Save under `artifacts/qa/ibl/`. Headless real Chrome only.
2. Apply the fix from the write-up (`// IBL:` marks). Re-capture. Where an
   arena's luminance moved more than ~1% from its approved look, re-tune that
   arena's grade/metalness constants in `src/rendering/art-direction.ts` or
   the arena definition until it is back, with the before/after numbers.
   Night/indoor arenas: never add linear contrast (combat-safety datum:
   rustworks night shadow mass 15/255 baseline).
3. Land the gate the write-up asks for: a test that fails if first-load and
   second-load environments differ.
4. `npx tsc --noEmit`; focused tests; commit per arena with explicit paths.

## Boundaries
- You own: the environment/IBL branch in `src/legacy-main.ts` (LF preserved,
  `// IBL:` marks), `src/rendering/art-direction.ts`, per-arena grade and
  material constants that the fix forces you to re-tune, the new gate.
- Do NOT touch: viewmodel/weapons, spawns, lobby/netcode, farcrysis, the
  atomic-acres lawn field (Lane A owns perf there). If Lane A's fps work and
  your grade re-tune touch the same arena file, keep your diff to the grade
  constants only.
- Machine rules: headless only, one browser, one build, never kill
  processes, never the full vitest suite, `nvidia-smi` needs 3 GB free
  before a browser launch.

## Report
Per-arena table: first-load vs second-load luminance before and after, the
target look chosen and why, constants changed, gate name, commits, screenshots
compared. Claim-state every line: VERIFIED / CLAIMED / OPEN.
