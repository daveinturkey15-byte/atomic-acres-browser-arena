# Lane AF — streamline review of everything that landed in PASS 85-87 (owner standing directive)

Orchestrator: Claude Code (Fable 5.1). Owner, repeatedly: "streamline,
refactor and improve going forward"; "will it be all tested and debugged and
refined, streamlined, refactored". This lane is the refinement pass over the
merged diff, run AFTER the feature lanes have merged and BEFORE the final
publish gate.

Worktree: run in `C:\Users\david\projects\aa-omp-pass84` on the integration
branch, in a dedicated branch `contrib/dave-gaming-pc/claude/streamline-pass87`
created from the integrated head (`git checkout -b ... <head>` in a fresh
worktree `aa-claude-streamline` with a junctioned `node_modules`).

## Facts
- `src/legacy-main.ts` (~35k lines, LF) has a line-count ratchet if Lane N
  landed it; ten earlier "streamline" commits grew the file. Do NOT run a
  broad refactor on it; extract only what the merged lanes added if a
  module boundary is obvious (each lane marked its regions: `// HF-399:`,
  `// HF-402:`, `// MP-LAB:`, `// GAMEPAD:`, `// FARCRYSIS-LOAD:`,
  `// HF-410:`, `// HF-412:`, `// LIGHTING:`, `// MAP3:`, `// NUKETOWN2:`).
- The repo has a reviewer contract: source-pinned tests break on cosmetic
  moves. Every change here must keep the full suite green.

## Job
1. Diff review of the integrated head against the PASS 84 head (75a4e508):
   per lane region, look for duplicated logic (two lanes solving the same
   thing twice), dead code left behind by a rework (e.g. the contact lift
   and pullback paths after HF-410; old spawn helpers after HF-402; the
   stone-shell arena code after HF-409), inconsistent naming, copy-pasted
   test helpers, debug hooks that ship in production bundles without a
   guard, and any `// TODO` a lane left.
2. Apply the safe simplifications: remove dead paths with their tests
   re-pinned (with the reason), fold duplicates into one helper, keep
   behaviour identical (no gameplay or visual change). One commit per
   simplification with the before/after line counts.
3. Bundle check: `npm run build`; compare `dist/assets/index-*.js` size
   before and after; report the delta.
4. `npx tsc --noEmit` and the FULL `npx vitest run` (this lane is allowed to,
   it runs alone at the end) must be green; commits with explicit paths.

## Boundaries
- No behaviour changes, no feature work, no gate weakening. If a
  simplification changes behaviour, put it in the report instead.
- Machine rules as every lane (one build; the full suite only once, alone).

## Report
Per simplification: what, why, lines removed, tests touched; bundle delta;
suite result; commits; the list of things you deliberately left alone.
Claim-state every line.
