# Lane AD — retire or fix the GitHub release workflow that would re-stage the retired channels

Orchestrator: Claude Code (Fable 5.1). Lane F (PASS 84) found:
`.github/workflows/release-production.yml`, `scripts/qa/verify-release-topology.mjs`
and `scripts/release/stage-release-topology.mjs` still describe the pre-PASS-80
topology (the-big-one, pass72/70/69-retained, recent-stable, pass63-rollback).
Running the workflow would re-stage the trees HF-400 retired over gh-pages.
Every pass since 74 shipped through `scripts/orchestration/publish_passNN.py`.

Worktree: create `C:\Users\david\projects\aa-claude-ci`:
`cd C:\Users\david\projects\aa-omp-pass84 && git worktree add ../aa-claude-ci -b contrib/dave-gaming-pc/claude/release-ci-two-channel <current head>`
then junction `node_modules`.

## Job
1. Make the CI workflow SAFE: it must refuse to publish unless the
   two-channel policy holds (exactly the current live pass + one pinned
   backup), and its staging must derive the channel set from
   `release-channels.json` instead of hardcoding retired trees. Simplest
   acceptable outcome: the workflow becomes a verify-only job (build, gates,
   receipt) with the publish step removed and a comment pointing at the
   Python publish path; a fuller outcome: it calls the same publish script.
2. Update `verify-release-topology.mjs` / `stage-release-topology.mjs` and
   `tests/e2e/release-channel-chooser.spec.ts` (expects `/channels/the-big-one/`)
   to the live topology, deriving from config, with a contract test that
   fails if any script hardcodes a channel path.
3. Generalise the publish script: `publish_passNN.py` siblings are copied per
   pass; extract the shared logic into one module with the pass number and
   backup as parameters, keeping every guard (freshness, farcrysis-hidden,
   release-identity, predecessor, in-build fallback, post-state) and their
   red self-tests; the per-pass sibling becomes a thin config. Prove with
   the existing plan contract tests plus a dry-run against gh-pages.
4. `npx tsc --noEmit`; the release/topology vitest files; `node --test` for
   the contract tests; commits with explicit paths.

## Boundaries
- You own: `.github/workflows/release-production.yml`, the release/topology
  scripts and their tests, `scripts/orchestration/publish_*.py`.
- Do NOT publish anything; do NOT trigger the workflow; do NOT touch
  gh-pages.
- Machine rules as every lane (no browsers needed).

## Report
What the workflow does now, the contract tests, the shared publish module
and the dry-run output, commits. Claim-state every line.
