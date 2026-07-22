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
2. Confirm the player-facing changelog is truthful. Use a metadata-only follow-up PR if the first successful production timestamp is not yet known; do not invent it.
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
