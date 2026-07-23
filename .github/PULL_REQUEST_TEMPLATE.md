## Outcome

<!-- One bounded user-visible or pipeline outcome. -->

## Contribution receipt

- Machine: `required`
- Harness/person: `required`
- Worktree: `required; no secrets or user-private paths`
- Base `origin/main` SHA: `required`
- Head SHA: `required`
- Branch: `contrib/<machine>/<harness>/<slug>`
- Related task/issue: `required or none`
- Release-note impact: `player-facing / internal-only`
- Change impact: `process-only / release-shell / runtime`
- Planned browser gate: `none / release-shell / full`

## Changed paths

<!-- List the intentional path boundaries. -->

## Verification

<!-- Exact commands and results. Do not write only "tests pass". -->

- [ ] `npm run pipeline:preflight -- --machine <machine> --harness <harness>`
- [ ] Focused tests for the changed surface
- [ ] `npm run lint`
- [ ] `npm test`
- [ ] `npm run build`
- [ ] Browser/visual evidence supplied when user-visible rendering changed
- [ ] Any timeout, threshold, baseline, or assertion change is separately justified with evidence
- [ ] Worktree is clean and the PR contains current `origin/main`

## Claim states

- Observed:
- Inferred:
- Assumptions:
- Unknowns:
- Falsifiers:

## Production boundary

- [ ] I did not push `main` or `gh-pages`, merge this PR, or deploy production from this contribution task.
