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
8. Dave normally tests that immutable preview. Record its exact source SHA and timestamp in the manifest, add Dave's approval, and push only the manifest/process update. If Dave explicitly orders publication before public-build HITL, the manifest may instead bind a structured standing-publication authorization to the exact preview while truthfully recording that preview inspection was not performed and deferring human public HITL. Any later runtime or release-shell change invalidates either form of authorization and requires a new preview.
9. Stop at handoff. The contributor does not merge or deploy.

Pass 66 was the first historical use of that narrow standing conditional publication path. Dave instructed the release owner to publish Version 66 as **The Big One** when the frozen candidate was genuinely green, without another subjective HITL feedback round, while keeping byte-exact Pass 63 Stable and never publishing Pass 65. For every pass using this path, the immutable preview, exact-SHA gates and acceptance manifest remain mandatory; the process-only acceptance update must bind the standing instruction to the exact preview, explicitly state that Dave did not inspect or test it, and retain a deferred human public-HITL requirement. Any later runtime or release-shell drift invalidates the binding.

Pass 65 is superseded audit evidence and must never be promoted.

Before implementation, declare one mechanically conservative impact class:

| Class | Typical paths | Required browser work |
|---|---|---|
| `process-only` | documentation, agent contract, PR template, release scripts/workflows | no Playwright; both static/unit jobs still run |
| `release-shell` | chooser, changelog, root HTML, favicon/manifest, release-channel config | focused `release-shell` Chromium smoke on Windows and Linux |
| `runtime` | gameplay, networking, rendering, assets, dependencies, unknown paths | full representative Windows/Linux browser groups plus affected focused evidence |

### Release-line reconciliation (HF-536, added 2026-09-06)

A line whose ancestry was severed from `origin/main` is restored by exactly one merge commit
whose tree is byte-identical to the contribution head's tree and whose second parent is
`origin/main`. That shape changes no shipped byte, so it cannot be evaluated by
`--phase ci`: it necessarily touches every enforced pass manifest at once and
`selectCiAcceptanceManifest` correctly throws `found 6`.

`scripts/release/acceptance-gate.mjs --phase reconciliation` is the narrow, fail-closed
exception. It accepts a head only when **all** of these hold, and throws on every other
shape:

1. the head has exactly two parents;
2. `git rev-parse head^{tree}` equals `git rev-parse head^1^{tree}`;
3. `head^2` equals the pull-request base SHA;
4. `head^1` is not itself a root commit, and every root reachable from `head^1` is listed in
   `.github/ancestry-roots.json`;
5. the newest enforced acceptance manifest reachable from `head^1` exists, parses, and — if
   it claims `status: accepted` — passes full manifest validation.

The receipt records `reconciliation: true`, `treeIdenticalTo: <head^1>`, the bound manifest
path and sha256, and `grantsAcceptance: false`. **A reconciliation receipt is never owner
approval.** The merge introduces no byte to approve; acceptance of the bytes it carries
across stays owed on the contribution line, and a manifest still marked `candidate` is
reported honestly as unapproved rather than upgraded.

`verify.yml` enters the phase only when a repository writer has applied the
`reconciliation` label to the pull request. It is never inferred from the commit shape, so
an accidental two-parent head still takes the normal `--phase ci` path and still fails
there. Assertion 2 is what makes the ordering safe: if the guard change merged to `main` but
was not replayed onto the contribution line, a tree-identical merge would silently revert
it, and only a tree comparison detects that — a parent count would not.

A reconciliation PR classifies as `runtime` and runs the full Windows + Linux browser
matrix. Do not add a reconciliation short-circuit to `change-impact.mjs`: for a line that
bypassed CI, this is the first time the tree faces the required checks, and that is the
point of doing it.

### Bounded divergence

An `integration/*` or gauntlet line is cut from exact `origin/main` and merges back to
`main` by pull request **within one pass** (one publish cycle). A line that has published a
pass and has not merged to `main` is a release-blocking condition for the next pass, not a
background chore. `release/<passN>` branches carry `docs/evidence/**` and acceptance
receipts only; a runtime commit on one is how a fix ships without `main` ever seeing it.

The impact table controls browser cost, not post-preview approval parity. `.github/workflows/release-production.yml` and `scripts/release/stage-release-topology.mjs` directly determine published bytes or topology; changing either after an immutable preview invalidates its authorization and requires a new preview even though the path classifies as process-only.

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

The canonical public root is a chooser, not gameplay bytes. `release-channels.json` schema 5 defines the intended post-promotion Pass 73 topology; configuration alone is not publication evidence. Pass 73 has no fixed `sourceSha` in that file: the protected production workflow must receive the exact final green `main` SHA and stage those bytes at `channels/the-big-one`. As verified from production workflow run `32432483550` and its receipt on 2026-08-21, GitHub Pages currently publishes Pass 72 from source `5da686551d92387d08b00be40125386c391bb3ed` through Pages commit `d5b77dc3b9e46608264c52eb0737b50590d70eb5`; Pass 72 remains public until a matching Pass 73 receipt, Pages publication and cache-busted live smoke succeed.

The promoted Pass 73 root chooser will expose four builds:

- **Pass 73** — the promotion target at `channels/the-big-one`, bound at dispatch to the exact final green `main` SHA.
- **Pass 72 · Previous Live** — byte-pinned from source `5da686551d92387d08b00be40125386c391bb3ed`, Pages commit `d5b77dc3b9e46608264c52eb0737b50590d70eb5` and historical subtree `channels/the-big-one`. Its embedded runtime identity is 515 files with digest `62fafc5e5c39fa744dfc4f7067b3e0953dd190d8ffecc04e203b2b86d6a8974f`; those Git blobs are copied unchanged to `channels/pass72-retained`.
- **Pass 70 · Retained Live** — byte-pinned from source `130fd59bd2cf1e1719b802463219ddf36e2484d5`, Pages commit `3b5e675c54eaea2a2dd721eca6f247c933361587` and historical subtree `channels/the-big-one`. Its embedded runtime identity is 515 files with digest `c8f6aeed492cd747ef83aa41bdc0d05f2fd86264418d40d0ebbd0916c85d6160`; those Git blobs are copied unchanged to `channels/pass70-retained`.
- **Pass 69 · Retained Stable** — byte-pinned from source `685ed7865018e107df5acf6cb6f7498b4468940c`, Pages commit `71ec5616504d8e24241450742d01b25c1d6ff4e4` and historical subtree `channels/the-big-one`. Its embedded runtime identity is 515 files with digest `5ace26fdf83a4cf695d0075a40523f70e0d6fcee02cb6ae5b42666b6679107b9`; those Git blobs are copied unchanged to `channels/pass69-retained`.
- **Pass 63 · Unlinked WebGL recovery evidence** — source-rebuilt at `channels/pass63-rollback` from source `ac85e9b8b46cc2370aee903d564ecf3c4682b24c`, recording original Pages commit `46d366d188bfc5ebc5ee7a991fd52b792575316c` and subtree `channels/pass63-rollback` as provenance and using that commit's normalized timestamp `2026-08-08T16:16:33Z`. It is absent from the chooser and legacy aliases. The historical 119-file digest `b7416e02c190d8ff0403a65cd7a7c894970507bc6a8de7b196cc2d7979d69bce` is provenance evidence, not an assertion that the new rebuild is byte-identical.

**Pass 67.1 · Stable Singleplayer** is staged but direct-only at `channels/recent-stable`. Production rebuilds pinned source `8c3ad1cd4d819aba79f07c01c16c8c4294fd14c1`, records original Pages commit `271cea28299570af8def30e879701ddbd3c4bc12` and subtree `channels/recent-stable` as provenance, and uses that commit's normalized timestamp `2026-08-03T11:48:01Z`. Its historical 508-file digest `d8d444578e83a408c2e4d63ca4d1c2c5b705521f565fee6a58daffeb1e205ce9` is likewise provenance evidence; production records a fresh rebuilt file count and digest.

On the promoted public root, room invitations and `release=latest`, `normal` or `experimental` select Pass 73; `previous`, `pass72`, `stable` or `rollback` select Pass 72; `pass70` selects Pass 70; and `pass69` selects Pass 69. Pass 67.1 and Pass 63 have no chooser card or legacy alias.

The production workflow rebuilds Pass 67.1 and Pass 63 from their pinned source commits, derives their original Pages-commit timestamps and records fresh rebuild provenance. `scripts/release/stage-release-topology.mjs` copies Pass 72, Pass 70 and Pass 69 from their pinned Pages trees without rebuilding them, while `scripts/qa/verify-release-topology.mjs` verifies every pinned byte identity and recomputes rebuilt provenance. The separate Pass 62 best-netcode benchmark remains immutable, offline/reconstructible and byte-pinned; it must never be rebuilt.

Changing any source SHA, Pages SHA, historical runtime identity, timestamp policy or route policy is a separate reviewed release decision. Never infer publication or stability from a pass number, branch name, local build or source configuration.

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
