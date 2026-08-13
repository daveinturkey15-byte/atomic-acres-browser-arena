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
   npx --yes npm@10.9.8 ci --ignore-scripts
   npm run qa:lockfile
   npm run pipeline:preflight -- --machine <machine> --harness <harness>
   ```

4. Implement one bounded outcome. Do not share the worktree with another task.
5. Run focused checks, then the relevant repository gates. Rendering changes require browser evidence.
6. For `release-shell` or `runtime` work targeting Pass 62 or later, add exactly one `acceptance/pass-<number>.json`. Translate every item of Dave's feedback into a numbered requirement with an expected result, falsifier, acceptance type, and concrete evidence. A passing test not named by a requirement is not evidence that the feedback was covered.
7. Commit intentionally, rerun the preflight, push only the contribution branch, and open a PR with the repository template. CI builds the exact PR head and uploads `pr-preview-<pr>-<head-sha>`.
8. Dave tests that immutable preview. Record its exact source SHA and timestamp in the manifest, add Dave's approval, and push only the manifest/process update. Any later runtime or release-shell change invalidates approval and requires a new preview.
9. Stop at handoff. The contributor does not merge or deploy.

Pass 66 and Pass 71 have explicit, narrow authorization exceptions. Dave instructed the release owner to publish each frozen candidate as **The Big One** only when it is genuinely green, without waiting for another subjective HITL feedback round; Pass 71 replaces Pass 70 while retaining Pass 69 and byte-exact Pass 63. The immutable preview, exact-SHA gates and acceptance manifest remain mandatory. Only after that preview exists may a process-only acceptance update bind the standing instruction to its exact SHA and actual binding time; it must state truthfully that Dave did not inspect or test that immutable preview in a new HITL round. Any later runtime or release-shell drift invalidates the binding. This exception does not apply to another pass.

Before implementation, declare one mechanically conservative impact class:

| Class | Typical paths | Required browser work |
|---|---|---|
| `process-only` | documentation, agent contract, PR template, release scripts/workflows | no Playwright; both static/unit jobs still run |
| `release-shell` | chooser, changelog, root HTML, favicon/manifest, release-channel config | focused `release-shell` Chromium smoke on Windows and Linux |
| `runtime` | gameplay, networking, rendering, assets, dependencies, unknown paths | full representative Windows/Linux browser groups plus affected focused evidence |

`scripts/release/change-impact.mjs` is the executable classifier. It fails safe: an empty, unknown, or mixed runtime diff selects `runtime`. The two required browser job names always complete; for `process-only` changes they record the skip decision and succeed without installing Chromium.

Do not change a test contract merely because CI failed. A timeout, performance budget, screenshot baseline/tolerance, or assertion change must identify the observed failure, explain why the old contract is wrong, retain the original product invariant elsewhere, and receive explicit integrator review. If that work is not required for the user outcome, move it to a separate maintenance PR.

The preflight writes a scrubbed JSON receipt under ignored `artifacts/pipeline/`. Attach its contents or the equivalent fields to the PR; never attach credentials, room codes, private paths, or chat logs. See `acceptance/README.md` and `acceptance/example.json` for the acceptance contract. Passes below 62 remain available for rollback and receive an explicit `legacyExempt` receipt rather than fabricated evidence.

## Integrator flow

One integrator owns the queue at a time.

1. Read every open PR and reject overlapping write scopes until the owners reconcile them.
2. Inspect the real diff; do not trust a task's self-report.
3. Require the PR head to contain current `origin/main` and rerun checks after any reconciliation.
4. Require all five checks:
   - `static-and-unit (ubuntu-latest)`
   - `static-and-unit (windows-latest)`
   - `bounded-browser-linux`
   - `bounded-browser-windows`
   - `requirements-acceptance`
5. Inspect the acceptance coverage artifact. Confirm every requirement is verified or explicitly deferred by Dave, approval names the preview SHA, and the gate reports no runtime/release-shell change after that preview.
6. Merge one PR at a time. A merge means integrated, not live.
7. Delete the remote contribution branch after merge only when its PR and recovery evidence are retained. Never delete another machine's local worktree.

## Release-owner flow

Only the `release-production` GitHub Actions workflow may publish production.

1. Wait for the merge commit's five required checks to succeed, including `requirements-acceptance`.
2. Confirm the player-facing changelog is truthful. A new top entry may use `PENDING_PRODUCTION` through `resolveProductionReleasedAt`; the protected workflow injects one immutable production-build timestamp and records the same value in its receipt. A publicly selectable fallback may never retain that sentinel: if its pinned historical Pages bytes predate timestamp injection, rebuild its exact approved source with the immutable timestamp of the pinned Pages publication, record `rebuiltFromSource: true`, and verify every live channel shows a real UK-local day/date/time. At the start of the next substantive pass, freeze the previous entry from that receipt. Do not create a post-release metadata PR or second deployment solely to learn a timestamp.

   ```ts
   releasedAt: resolveProductionReleasedAt(PENDING_PRODUCTION_RELEASE)
   ```
3. Dispatch `release-production` with the exact full `main` SHA and release pass.
4. The workflow refuses a non-tip SHA, requires successful checks, builds from a clean checkout, serializes Pages publication, preserves the historical review tree, and records source/Pages identities.
5. The workflow revalidates the accepted manifest against the exact source SHA. Pass 62 and later cannot publish without approval parity; older rollback passes are marked legacy-exempt.
6. Wait for the workflow receipt and exact Pages build to succeed.
7. The workflow then verifies the canonical HTTPS site with a cache-busting query. It checks:
   - release eyebrow/pass;
   - Last Release button and timestamp;
   - current release details;
   - affected gameplay path;
   - zero warning/error browser logs.
8. Only then mark the release live and close the central tracker.

Every verify run uploads `pipeline-metrics-<head-sha>` and writes a job summary with total wall time, per-job queue/start delay, per-job execution time, requirement coverage, feedback-to-preview time, and preview-to-approval time. Every production receipt adds build, Pages, live-smoke, and total release durations. Use these receipts for benchmarking; do not estimate pipeline performance from chat timestamps.

The first successful exact-SHA receipt plus cache-busted live smoke is the terminal condition. Send the completion report immediately. A non-blocking favicon, copy, baseline, documentation, or CI-hygiene defect becomes a separate queued task and must not keep the release turn open. Only a load failure, security/data-loss risk, broken affected gameplay path, incorrect release identity, or unexpected runtime error that invalidates the live claim reopens the release as a hotfix.

### Agent communication and waiting

- Before an external wait longer than two minutes, tell Dave exactly which run/SHA is pending and what success means.
- Use one-shot `gh run view`/Pages status reads. Never launch duplicate or unbounded `gh run watch` processes from a conversational turn.
- Report only material transitions: queued, running, failed with the failing gate, or complete with receipt identities.
- A wait timeout means "re-read authoritative state," not "rerun, rewrite a test, or republish."
- After live proof, stop the release task. Do not start a cleanup PR without a new bounded task.

`npm run deploy` remains available for recovery archaeology but is prohibited for normal contribution and release tasks.

## Player release channels

The canonical root is a chooser, not a gameplay build. Pass 66 source stages schema 4 locally with exactly two intended choices, but this source configuration is not evidence that Pass 66 is published or live:

- **The Big One** is the unpublished Pass 66 live target staged at `channels/the-big-one`. Dave's standing conditional instruction authorizes its promotion without another subjective HITL round only after an immutable preview exists, all blocking mechanical and visual evidence is green, the truthful process-only acceptance binding and exact-main checks pass, and the protected production workflow is dispatched.
- **New Netcode** remains the immutable Stable channel pinned to the released Pass 63 source `1bd55076c952080d5f7a8a5b0b8869aaa0646a76`, Pages SHA `2201a606a8c9f83d441036eac07dc140bd7e63f5`, exact historical `channels/experimental-netcode-pass` subtree, 119-file runtime set, and tree digest `61666de694ea6bd62391c1e0661ffcc2864142bb569407c93a2ebdfd28031ce7`.

Pass 64 remains the currently published failed-regression comparator only until the authorized Pass 66 promotion succeeds; it is never Stable. Its published source `5075a52d80c6db69a97ed53acc2df5368728371a`, Pages SHA `8326c95659a9fb8c5979c13f9b88126c4ffb85f7`, 130-file channel and digest `ffd3e130d005e9321976795fe2d5cadfd9965ebb27dc0bbff0c1609816cff20b` stay separately identified in candidate project-map evidence. Pass 65 is superseded audit evidence and must never be promoted.

The Stable channel is a Git commit identity, not a moving branch or manually copied folder. During an authorized promotion, `scripts/release/stage-release-topology.mjs` reconstructs Pass 63 only from the source and Pages commits pinned in `release-channels.json`, places the exact Pass 66 build under `channels/the-big-one`, replaces the root with the two-choice chooser, and records provenance plus tree digests. `scripts/qa/verify-release-topology.mjs` byte-compares every archived Pass 63 file to its pinned Git blob before deployment. Only after a successful protected promotion do room invitations and legacy `latest` or `normal` links become live Pass 66 routes. The separate Pass 62 benchmark record remains immutable offline/reconstructible historical evidence.

Changing either pinned Pass 63 SHA is a separate reviewed release decision. Verify the candidate was genuinely live, update the config in one PR, and test the root chooser plus both direct channel URLs before promotion. Never infer "stable" from a pass number, branch name, local build, or chat claim.

## Multi-machine setup

Each machine needs Git, Node 22, npm 10.9.8, and GitHub CLI authenticated for this repository. Contributors need `repo`; release owners who change workflow files also need `workflow`. `package.json#packageManager` is the executable package-manager authority; do not regenerate the lockfile with a newer npm and assume an existing `node_modules` proves that CI can clean-install it.

Run on every machine:

```bash
npx --yes npm@10.9.8 ci --ignore-scripts
npm run qa:lockfile
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

## Lockfile compatibility gotcha

**Symptom -> Cause -> Correction -> Verify:** local tests pass but both CI operating systems fail immediately in `npm ci` with a missing transitive package -> the lockfile was accepted or regenerated by a different npm resolver than the pinned CI package manager -> run `npx --yes npm@10.9.8 install --package-lock-only --ignore-scripts`, retain `packageManager: npm@10.9.8`, and never hand-edit dependency entries -> `npm run qa:lockfile` succeeds before the contribution is pushed.
