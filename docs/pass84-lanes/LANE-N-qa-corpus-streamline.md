# Lane N — QA corpus streamline: audit, then apply the safe items

Orchestrator: Claude Code (Fable 5.1). Owner standing directive: "streamline,
refactor and improve going forward" (2026-09-02, twice; 2026-08-22 cadence).

Worktree: `C:\Users\david\projects\aa-claude-corpus`
Branch: `contrib/dave-gaming-pc/claude/qa-corpus-streamline` (base 7a083e48)

## Known findings (2026-08-31 audit) to confirm, not assume
- 45 of 75 e2e specs under `tests/e2e` are referenced by nothing.
- Exactly one `toHaveScreenshot` in the corpus, and it photographs the menu
  with the text overwritten.
- Both CI workflows under `.github/workflows` never mention webgpu; every
  green in this repo's history ran on WebGL2 looking at metadata while the
  owner plays WebGPU.
- 40 graphics controls are "verified" by `runtimeEvidence()` grepping a
  source symbol (`src/graphics-settings-registry.ts`) instead of observing a
  frame; that is how `scene.environment` null on first load passed nine unit
  tests.
- Three gates carried hardcoded arena rosters and went green while never
  looking at the newest arenas.
- `tests/e2e/pass66-viewmodel-framing.spec.ts` (243 lines, 8 commits) is
  wired to nothing; one-line fix into `scripts/qa/run-bounded-e2e.mjs` SUITES.
- `src/legacy-main.ts`: 10 "streamline" commits since 2026-07-27 netted
  -191 lines while it grew +3,400 to ~34,740. Do NOT run another streamline
  pass on it; add a line-count ratchet test instead (fails if the file grows
  past its current count, with a documented way to lower the ceiling).

## Job
1. AUDIT first, as a report at `docs/QA_CORPUS_AUDIT_2026-09-02.md`
   (committed): every e2e spec and every `scripts/qa` script with
   referenced-by or ORPHAN, last commit date, line count; package.json
   scripts pointing at missing files; the hardcoded-roster list; the
   runtimeEvidence grep-only controls; the single screenshot assertion.
2. APPLY only the safe classes, each its own commit:
   (a) one-line wirings of orphaned specs that still pass (run each one
   headless once before wiring; if it fails, leave it orphaned and list it);
   (b) derive rosters from the registry (`src/map-selection.ts`) in every
   gate/script that hardcodes one, with a contract test asserting the roster
   equals the registry and is cross-arena distinct;
   (c) the legacy-main line-count ratchet;
   (d) delete only exact duplicates of a wired spec (same assertions), with
   the pair named in the commit.
   Deletions of anything else, and any change to the graphics
   runtimeEvidence model, go in the report as PROPOSED, not applied.
3. `npx tsc --noEmit`; run every wired/added test file you touched; never
   the full suite.

## Boundaries
- You own: `tests/e2e/**`, `scripts/qa/**` wiring/roster code, the audit
  doc, the ratchet test. Coordinate-by-avoidance: Lane G is creating
  `scripts/qa/mp-lab/**` and `tests/e2e/mp-lab*`; Lane D edits the spawn
  gate; Lane J edits the eye-clearance sweep; do not touch those files.
  `package.json` edits: add script entries only, never reorder or remove.
- Machine rules as every lane (headless only, one browser, one build).

## Report
Counts per class (wired, derived, ratcheted, deleted, proposed), the doc
path, commits, anything you could not verify. Claim-state every line.
