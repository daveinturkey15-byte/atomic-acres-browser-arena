# Atomic Acres agent contract

These rules apply to Codex, Hermes, Gemini/AGY, and any future human or automated contributor.

## Sources of truth

- `origin/main` is the only source branch for production candidates.
- GitHub pull requests are the central contribution ledger. Chat/session claims and local branches are not release state.
- The `gh-pages` branch is production output only. Never develop on it or publish to it from a feature worktree.
- `docs/CONTRIBUTION_AND_RELEASE_PIPELINE.md` is the canonical contribution and release procedure.

## Contribution isolation

- Fetch `origin/main`, create a clean isolated worktree, and use `contrib/<machine>/<harness>/<slug>` for new work.
- One worktree has one owner and one bounded outcome. Never let two agents write the same worktree.
- Run `npm run pipeline:preflight -- --machine <machine> --harness <harness>` before implementation and again before handoff.
- Do not clean, reset, stash, move, or delete another task's worktree. Reconcile it read-only and preserve uncertain state.
- Record observations, inferences, assumptions, unknowns, and falsifiers separately when they affect release decisions.

## Integration and production

- Contributors may commit and push only their contribution branch. They must not push `main`, push `gh-pages`, merge their own PR, or run `npm run deploy`.
- Every PR must use the repository template and identify its machine, harness, base SHA, head SHA, changed paths, tests, and release-note impact.
- A separate integrator reviews the actual diff and checks. The PR must contain current `origin/main` before merge.
- Production promotion is serialized by `.github/workflows/release-production.yml`. Supply the exact green `main` SHA and release pass; never deploy from a feature branch or local dirty tree.
- Do not describe a change as live until the workflow receipt names the source SHA and Pages SHA and the canonical HTTPS site is checked.

## Durable gotcha

**Symptom -> Cause -> Correction -> Verify:** several agents report successful work but production is stale or contradictory -> local worktrees, PR merges, Pages pushes, and release metadata were treated as interchangeable state -> use PRs as the contribution ledger and the single serialized production workflow as the only publisher -> confirm exact `main` SHA, successful required checks, workflow receipt, Pages SHA, release-button timestamp, and live browser logs.
