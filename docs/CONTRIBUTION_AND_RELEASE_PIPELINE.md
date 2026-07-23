# Contribution and production pipeline

This is the current cross-machine contract for Atomic Acres. It replaces chat-led release coordination and direct local Pages pushes.

## Authority model

| State | Authority | Meaning |
|---|---|---|
| Proposed | isolated worktree | Local work only; may be incomplete or dirty |
| Contributed | GitHub PR | Centrally visible diff, receipt, checks, and discussion |
| Integrated | `origin/main` | Merged source, not automatically production |
| Released | production workflow receipt | Exact green `main` SHA was built and promoted |
| Live | canonical HTTPS verification | Pages SHA, release panel, runtime, and browser logs agree |

No harness may skip a state or infer a later state from an earlier one.

## Identity and branch naming

Every contribution uses:

```text
contrib/<machine>/<harness>/<short-outcome>
```

Use lowercase ASCII slugs, for example:

```text
contrib/dave-gaming-pc/codex/rustworks-wave-tuning
contrib/desky/hermes/terminal-collision-proof
contrib/laptop/alice/input-remapping
```

The machine name identifies where the bytes originated; the harness identifies who or what authored them. Neither grants merge or release authority.

## Contributor flow

1. Fetch `origin` and create a new worktree from exact `origin/main`.
2. Create the contribution branch using the naming contract.
3. Run:

   ```bash
   npm ci
   npm run pipeline:preflight -- --machine <machine> --harness <harness>
   ```

4. Implement one bounded outcome. Do not share the worktree with another task.
5. Run focused checks, then the relevant repository gates. Rendering changes require browser evidence.
6. Commit intentionally, rerun the preflight, push only the contribution branch, and open a PR with the repository template.
7. Stop at handoff. The contributor does not merge or deploy.

Before implementation, declare one mechanically conservative impact class:

| Class | Typical paths | Required browser work |
|---|---|---|
| `process-only` | documentation, agent contract, PR template, release scripts/workflows | no Playwright; both static/unit jobs still run |
| `release-shell` | chooser, changelog, root HTML, favicon/manifest, release-channel config | focused `release-shell` Chromium smoke on Windows and Linux |
| `runtime` | gameplay, networking, rendering, assets, dependencies, unknown paths | full representative Windows/Linux browser groups plus affected focused evidence |

`scripts/release/change-impact.mjs` is the executable classifier. It fails safe: an empty, unknown, or mixed runtime diff selects `runtime`. The two required browser job names always complete; for `process-only` changes they record the skip decision and succeed without installing Chromium.

Do not change a test contract merely because CI failed. A timeout, performance budget, screenshot baseline/tolerance, or assertion change must identify the observed failure, explain why the old contract is wrong, retain the original product invariant elsewhere, and receive explicit integrator review. If that work is not required for the user outcome, move it to a separate maintenance PR.

The preflight writes a scrubbed JSON receipt under ignored `artifacts/pipeline/`. Attach its contents or the equivalent fields to the PR; never attach credentials, room codes, private paths, or chat logs.

## Integrator flow

One integrator owns the queue at a time.

1. Read every open PR and reject overlapping write scopes until the owners reconcile them.
2. Inspect the real diff; do not trust a task's self-report.
3. Require the PR head to contain current `origin/main` and rerun checks after any reconciliation.
4. Require all four checks:
   - `static-and-unit (ubuntu-latest)`
   - `static-and-unit (windows-latest)`
   - `bounded-browser-linux`
   - `bounded-browser-windows`
5. Merge one PR at a time. A merge means integrated, not live.
6. Delete the remote contribution branch after merge only when its PR and recovery evidence are retained. Never delete another machine's local worktree.

## Release-owner flow

Only the `release-production` GitHub Actions workflow may publish production.

1. Wait for the merge commit's four required checks to succeed.
2. Confirm the player-facing changelog is truthful. A new top entry may use `PENDING_PRODUCTION` through `resolveProductionReleasedAt`; the protected workflow injects one immutable production-build timestamp and records the same value in its receipt. At the start of the next substantive pass, freeze the previous entry from that receipt. Do not create a post-release metadata PR or second deployment solely to learn a timestamp.

   ```ts
   releasedAt: resolveProductionReleasedAt(PENDING_PRODUCTION_RELEASE)
   ```
3. Dispatch `release-production` with the exact full `main` SHA and release pass.
4. The workflow refuses a non-tip SHA, requires successful checks, builds from a clean checkout, serializes Pages publication, preserves the historical review tree, and records source/Pages identities.
5. Wait for the workflow receipt and Pages build to succeed.
6. Verify the canonical HTTPS site with a cache-busting query:
   - release eyebrow/pass;
   - Last Release button and timestamp;
   - current release details;
   - affected gameplay path;
   - zero warning/error browser logs.
7. Only then mark the release live and close the central tracker.

The first successful exact-SHA receipt plus cache-busted live smoke is the terminal condition. Send the completion report immediately. A non-blocking favicon, copy, baseline, documentation, or CI-hygiene defect becomes a separate queued task and must not keep the release turn open. Only a load failure, security/data-loss risk, broken affected gameplay path, incorrect release identity, or unexpected runtime error that invalidates the live claim reopens the release as a hotfix.

### Agent communication and waiting

- Before an external wait longer than two minutes, tell Dave exactly which run/SHA is pending and what success means.
- Use one-shot `gh run view`/Pages status reads. Never launch duplicate or unbounded `gh run watch` processes from a conversational turn.
- Report only material transitions: queued, running, failed with the failing gate, or complete with receipt identities.
- A wait timeout means "re-read authoritative state," not "rerun, rewrite a test, or republish."
- After live proof, stop the release task. Do not start a cleanup PR without a new bounded task.

`npm run deploy` remains available for recovery archaeology but is prohibited for normal contribution and release tasks.

## Player release channels

The canonical root presents two explicit choices before loading the game:

- **New build** loads the newest production source promoted by the protected workflow.
- **Recent stable** loads an immutable copy of the exact Pages commit pinned in `release-channels.json`.

The stable channel is a Git commit identity, not a moving branch or a manually copied folder. During every production promotion, `scripts/release/stage-stable-channel.mjs` reconstructs only that commit's root `index.html` and `assets/` beneath the configured channel path. Room invitation URLs bypass the chooser and continue into the newest multiplayer client so a shared lobby cannot split across incompatible releases.

Changing the pinned stable SHA is a separate reviewed release decision. Verify the candidate was genuinely live, update the config in one PR, and test both the root chooser and the direct stable URL before promotion. Never infer "stable" from a pass number, branch name, local build, or chat claim.

## Multi-machine setup

Each machine needs Git, Node 22, npm, and GitHub CLI authenticated for this repository. Contributors need `repo`; release owners who change workflow files also need `workflow`.

Run on every machine:

```bash
npm ci
npm run pipeline:doctor
```

Do not copy `.git`, credentials, Hermes state, Codex sessions, `node_modules`, or dirty worktrees between machines. Clone/fetch from GitHub, exchange PR URLs and SHAs, and regenerate dependencies locally.

When other people join, enable a required reviewer on the `production` environment and require a non-author approval. Until then, separation is procedural: implementer, integrator, and release-owner actions must occur as distinct tasks with independent evidence.

## Hermes and other harnesses

Hermes, Codex, Gemini/AGY, and future harnesses all read `AGENTS.md` and this document. Hermes uses the local `atomic-acres-release-coordination` skill to route work through the same preflight and PR boundary.

Desky (`dave-gaming-pc`) is the current development host and supports local validation of both Performance and Quality Graphics. Those profiles share one physics contract. A runtime PR that adds or changes substantial player-reachable geometry must prove matching movement and projectile authority in both presentations; profile-specific invisible blockers are a release failure.

Harnesses may implement and verify in isolated worktrees. They may not silently merge, publish Pages, weaken a gate, reuse another task's preview server, or treat session text as provenance. The exact Git diff, checks, workflow receipt, and live site are the evidence.

## Recovery and reconciliation

If tasks overlap or a machine disappears:

1. Freeze merges and releases.
2. Record `git worktree list --porcelain`, branch, HEAD, dirty paths, and `git cherry origin/main <head>` for every candidate.
3. Bundle any unique commit before cleanup. Preserve dirty worktrees until each path is classified as retained, superseded, or rejected.
4. Rebuild the candidate from current `origin/main` in a new clean worktree; never merge a dirty historical workspace directly.
5. Resume with one PR and one release owner.

## Permission failure gotcha

**Symptom -> Cause -> Correction -> Verify:** a normal code push works but a workflow-file push is rejected -> the GitHub OAuth token has `repo` but not `workflow` -> authorize `workflow` for the intended GitHub account, without changing remotes or bypassing authentication -> `gh auth status` lists `workflow`, the branch push succeeds, and the PR contains only the reviewed workflow/process diff.
