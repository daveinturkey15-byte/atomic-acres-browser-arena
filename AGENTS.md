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
- Declare the change impact before implementation: `process-only`, `release-shell`, or `runtime`. Unknown paths are `runtime`.
- Run `npm run pipeline:preflight -- --machine <machine> --harness <harness>` before implementation and again before handoff.
- Do not clean, reset, stash, move, or delete another task's worktree. Reconcile it read-only and preserve uncertain state.
- Record observations, inferences, assumptions, unknowns, and falsifiers separately when they affect release decisions.
- Do not weaken a timeout, threshold, screenshot tolerance, or assertion inside a feature fix merely to obtain green CI. A contract change needs explicit evidence and review.
- Desky (`dave-gaming-pc`) is the active development machine and can exercise both Performance and Quality Graphics. Treat both as presentations over one authoritative physics world: every substantial player-reachable visible object must have matching movement and shot authority in both profiles. Tiny grass, decals, particles, and overhead dressing may remain non-solid. Never add profile-only collision or hide a collider mismatch behind a render-profile switch; test affected geometry in both profiles.

## Integration and production

- Contributors may commit and push only their contribution branch. They must not push `main`, push `gh-pages`, merge their own PR, or run `npm run deploy`.
- Every PR must use the repository template and identify its machine, harness, base SHA, head SHA, changed paths, tests, and release-note impact.
- Every Pass 62+ `runtime` or `release-shell` PR must change exactly one `acceptance/pass-<number>.json`, map every requested outcome to evidence, and record Dave's approval of the immutable PR preview's exact source SHA. Runtime/release-shell changes after that preview invalidate approval.
- A separate integrator reviews the actual diff and checks. The PR must contain current `origin/main` before merge.
- `requirements-acceptance` is a required check alongside both static/unit and both bounded-browser checks. Green tests without complete requirement coverage are not release evidence.
- Production promotion is serialized by `.github/workflows/release-production.yml`. Supply the exact green `main` SHA and release pass; never deploy from a feature branch or local dirty tree.
- Do not describe a change as live until the workflow receipt names the source SHA and Pages SHA and the canonical HTTPS site is checked.
- The production workflow must revalidate the acceptance manifest and pass its post-Pages canonical live smoke before writing a successful receipt.
- The first successful receipt plus cache-busted live smoke is terminal for that release task. Report success immediately; route non-blocking hygiene to a later PR instead of silently extending the release.
- Do not run synchronous or duplicate `gh run watch` processes from an agent turn. Use one-shot status reads, report material state changes, and keep waits bounded.

## Durable gotcha

**Symptom -> Cause -> Correction -> Verify:** several agents report successful work but production is stale or contradictory -> local worktrees, PR merges, Pages pushes, and release metadata were treated as interchangeable state -> use PRs as the contribution ledger and the single serialized production workflow as the only publisher -> confirm exact `main` SHA, successful required checks, workflow receipt, Pages SHA, release-button timestamp, and live browser logs.
