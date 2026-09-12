# Project routing — one identity, one machine record

Status: active project rule from 2026-09-11. Implemented in `scripts/release/project-routing.mjs`
and enforced through `scripts/release/pipeline-guard.mjs`. Negative tests:
`scripts/release/project-routing.test.mjs` (`npm run verify:project-routing:contract`).

## Why

The 2026-09-11 pipeline audit found the delivery chain split across two Git databases
(`atomic-acres-browser-arena/.git` with 693 registered worktrees and the recovery database
`integration-full/.git` with 17 more), a global starting pointer parked on a September 4
checkout, an open red draft PR, and a newer clean candidate that no launcher named. The
existing guard checked branch shape, cleanliness and ancestry but never **which tree** the
agent stood in, so a launcher could open a stale checkout and pass every check. A prose
rule saying "confirm the worktree path" had already been violated with real damage
(`docs/MULTI_AGENT_REPO_DISCIPLINE.md` §1).

This is the executable form of that rule. It adds no service and no policy stack: one
committed identity file, one gitignored machine record, one module, two new guard
behaviours.

## The pieces

| Piece | Where | Committed? | Role |
|---|---|---|---|
| Project identity | `.github/project-identity.json` | yes | The one stable `projectId` (`atomic-acres-browser-arena`) and GitHub repository a launcher must name |
| Machine registry | `%LOCALAPPDATA%\atomic-acres-browser-arena\project-routing.json` (Windows) or `$XDG_CONFIG_HOME/atomic-acres-browser-arena/project-routing.json`; override with `ATOMIC_ACRES_ROUTING_REGISTRY` | **no** — machine-local runtime state | Binds the identity to this machine's Git database, lanes, integration, preview, production and rollback |
| Registry schema/example | `docs/PROJECT_ROUTING.example.json` | yes | Schema version 1, worked example with one open lane and one closed lane of each outcome |
| Module | `scripts/release/project-routing.mjs` | yes | Validation, path/ancestry probes, `init` installer, `show` readback |
| Guard | `scripts/release/pipeline-guard.mjs contribute --project --lane`, `lane-close` | yes | Fail-closed route check and closure verification |

The registry is deliberately **not** a committed pass pointer. A committed pointer is stale
the moment anyone integrates; a machine record has an installer, a readback, a schema
version and a staleness check that refuses to route from it once `origin/main` moves.

## What the registry separates

```text
gitCommonDir        the ONE Git database this machine routes; a tree from any other database is refused
integration         ref (refs/remotes/origin/main), expectedSha, destination (PR into main)
inspectedPreview    the exact SHA a human last inspected and what they said — a record, never approval
production          live pass, sourceSha, pagesSha, how it was verified
rollback            the pinned safe backup (HF-400)
protectedCheckouts  trees that are never contribution worktrees, whatever a lane says
lanes.<id>          worktree, branch, owner (machine/harness), baseSha, dispatchHeadSha,
                    allowedPaths, status open|closed, expiresAt, closure
```

`inspectedPreview.status` may not say `accepted` or `approved`; the schema refuses it.
Acceptance lives in `acceptance/pass-<N>.json`, and the guard never writes either.

## What the guard refuses (`contribute --project <id> --lane <id>`)

Every refusal starts `Refusing route:` and carries an error `code`. In order:

| code | condition |
|---|---|
| `wrong-project` | `--project` differs from `.github/project-identity.json`, or the registry belongs to another project |
| `wrong-machine` | registry machine identity differs from the caller |
| `protected-checkout` | the current tree is listed in `protectedCheckouts` (checked before the lane, so a lane cannot launder one) |
| `wrong-git-database` | `git rev-parse --git-common-dir` is not the registry's `gitCommonDir` |
| `unknown-lane` / `closed-lane` / `expired-lane` | the lane is unregistered, already closed, or past `expiresAt` |
| `wrong-owner` | `--machine/--harness` are not the lane's owner |
| `wrong-worktree` | `git rev-parse --show-toplevel` is not the lane's `worktree` (case-folded on Windows) |
| `wrong-branch` | current branch is not the lane's `branch` |
| `dirty-worktree` | any uncommitted path; unknown state is refused, never classified |
| `stale-base` | HEAD does not descend from `baseSha` (or the base is not in this database) |
| `stale-head` | HEAD is behind `dispatchHeadSha` — the stale-checkout mistake |
| `stale-integration-record` | fetched `origin/main` differs from `integration.expectedSha`; the record is stale, re-run readback |
| `outside-scope` | `git diff --name-only baseSha HEAD` has a path outside `allowedPaths` |

The existing checks are unchanged and still run first: branch shape, clean tree, HEAD contains
`origin/main`, complete ancestry, root allowlist.

## Legacy calls stay visibly legacy

An older, non-enforcing identity can accept `contribute` without `--project/--lane` only when
no committed, registry or environment control requires routing. Such a call prints
`WARNING: LEGACY ROUTE …` on stderr and stamps `routing: { mode: "legacy", … }` into the
receipt so nobody can read a legacy receipt as a routed one. This candidate commits
`routingRequired: true`, so it refuses legacy contribution regardless of environment or
registry availability. Registry `enforcement.legacyContribute: refuse` and environment
`ATOMIC_ACRES_ROUTING_REQUIRED=1` also require routing. An explicitly selected missing record
or an unreadable existing record fails closed.

Older checkouts do not gain this behavior automatically. Until the launcher cutover below,
a legacy preflight from an old checkout proves no routing identity.

## Lane closure (`lane-close --project <id> --lane <id>`)

A lane stops being a trap only when it is explicitly closed as one of two outcomes, and the
guard verifies the record it is given:

- **integrated** — `closure.laneHeadSha` must equal the worktree HEAD, be an ancestor of
  `closure.integratedIntoSha`, which must be reachable from the integration ref. A merge
  commit that never reached `origin/main` is not integration.
- **rejected** — `closure.reason` plus at least one verified preservation proof: a `refs/…`
  ref that resolves to the lane head, or a standalone bundle that restores the advertised
  commits into a temporary repository and passes object checks. Both are checked, not trusted.

In both cases a dirty tree is refused (uncommitted work is the only copy, DS-3), the receipt
records `grantsAcceptance: false`, `removedAnything: false` and the count of ignored paths
still in the tree, and **nothing is deleted, moved or re-pointed**. Retirement
(`git worktree remove`) remains a separate manual step that must follow §1 of
`docs/MULTI_AGENT_REPO_DISCIPLINE.md`. `lane-close` is the one non-doctor mode allowed to run on
a HEAD that does not contain current `origin/main`, because a rejected lane is by definition
behind; it still cannot contribute or release from there.

## Installer and readback

```powershell
# once per machine, from any tree of the intended Git database, after `git fetch origin main`
node scripts/release/project-routing.mjs init --machine dave-gaming-pc            # enforcement warn
node scripts/release/project-routing.mjs init --machine dave-gaming-pc --enforce refuse

# readback: path, validity, integration staleness against the LOCAL remote ref, every lane
node scripts/release/project-routing.mjs show      # or: npm run pipeline:routing -- show

# Native launchers call the stable integration script, from any current directory.
# A successful response contains the actual worktree and exact HEAD in a routed receipt.
node C:/Users/david/projects/atomic-acres-integration/scripts/release/project-routing.mjs resolve --project atomic-acres-browser-arena --lane <registered-id> --machine dave-gaming-pc --harness <owner> --worktree <absolute-path>
```

`resolve` requires an existing lane, binds an optional requested directory to it, and runs
the reviewed central contribution guard inside that lane. The guard fetches main, verifies
the target checkout and writes its ordinary receipt. No model is launched. A native launcher
must refuse a failed check; it must not choose another directory or register itself as a fallback.
Historical checkouts missing the project identity are refused. New lane creation and registration
are explicit integrator steps before dispatch; the resolver does not create worktrees.

`init` uses the example's schema, replaces `gitCommonDir`, `integration.expectedSha`, `machine`
and timestamps with observed values, empties `lanes`, initializes preview/production/rollback
as unknown (never copied as facts from the example), and **refuses to overwrite** an existing
record. Lanes are added by editing the JSON (the example shows the shape); every edit is
re-validated on the next guard run. Point `ATOMIC_ACRES_ROUTING_REGISTRY` at another file to
test a record without touching the machine's.

## Root cutover — what makes future launches require the route

None of this is active for other launchers until root does the following, in order. Each step
has a readback; do not report cutover on the strength of the previous step.

1. **Choose the Git database.** Decide whether `integration-full/.git` or the original
   `atomic-acres-browser-arena/.git` is the routed database for this machine (the audit says
   both must be preserved; the registry routes exactly one). Record the other as a
   `protectedCheckouts` entry or leave it unrouted — the guard refuses it either way.
2. **Install** the registry with `init --machine dave-gaming-pc` from a clean tree of that
   database after `git fetch origin main`. Readback with `show`; confirm `gitCommonDir` and
   `integration.expectedSha` are what you meant.
3. **Register the live lanes** (currently the three 2026-09-11 contribution trees and the
   inspected candidate) with owner, base, dispatch head, scope and `expiresAt`. Fill
   `inspectedPreview`, `production` and `rollback` from actual receipts, not memory. Readback.
4. **Run one routed preflight per lane** from inside that lane:
   `npm run pipeline:preflight -- --machine dave-gaming-pc --harness <h> --project atomic-acres-browser-arena --lane <id>`.
   A refusal here is a real routing defect to fix in the record or the tree, not in the guard.
5. **Enforce identity.** This candidate commits `routingRequired: true` in
   `.github/project-identity.json`. Missing, corrupt or misplaced machine records therefore
   cannot silently restore legacy contribution permission. Set `enforcement.legacyContribute`
   to `refuse` in the record too. `ATOMIC_ACRES_ROUTING_REQUIRED=1` is an additional launcher
   control, not the sole protection. Re-run a legacy preflight with no registry or environment
   override and confirm it is refused. Older checkouts still require the launcher cutover below.
6. **Update every launcher** (Codex launcher generator, the OMP wrapper, Hermes skill start
   card, Claude lane prompts) to pass `--project` and `--lane`, and replace the pass-numbered
   global starting pointer with "resolve the lane from the registry". Those files live outside
   this repository and outside this lane's scope; this document only names the change.
7. **After every integration**, re-point `integration.expectedSha` (or re-run `init` to a new
   path and swap) — the guard refuses stale records on purpose.

The repository guard is enforced in this candidate; cross-harness cutover remains incomplete
until every active launcher resolves and verifies the assigned lane through it.

All machine, worktree, preview, protected-checkout and bundle paths must be absolute. Registry
machine identity must match the caller. Rejected-lane bundle evidence must restore independently
into a temporary bare repository and pass object checks; a header, `list-heads`, or even
`bundle verify` alone can accept a missing pack. Thin bundles needing unstored prerequisites
are not standalone preservation. Verification never changes the source worktree or its refs.

## Falsifiers

- A `contribute` receipt with `routing.mode: "legacy"` and no stderr warning → the stamp is broken.
- A routed receipt from a tree whose `git rev-parse --git-common-dir` is not the registry's → the database check is broken.
- `lane-close` returning `ok` for a rejected lane whose bundle does not list the lane head → preservation verification is broken.
- Any tree, ref or file disappearing during `lane-close` → the guard has grown a side effect it must not have.
