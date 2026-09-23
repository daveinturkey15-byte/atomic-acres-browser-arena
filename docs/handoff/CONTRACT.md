# Cross-harness handoff contract — version 1

Owner directive: 2026-09-13. Applies equally to all harnesses and models.

## Stable locations

- `AGENTS.md`: shared repository rules; native files such as `CLAUDE.md` point here.
- `docs/handoff/START_HERE.md`: human entry point and ready-to-paste takeover prompt.
- `docs/handoff/CURRENT.json`: one current checkpoint pointer, schemaVersion 1.
- `docs/handoff/checkpoints/<checkpoint>/`: immutable checkpoint text records.
- `.handoff-evidence/`: ignored local bundle of approved project artifacts, with a
  SHA256 manifest. Preserve it for local takeover; transfer deliberately off-machine.

Never create a competing current handoff in a harness session folder. Worker reports
may be local to an owned lane, but the integrator links their terminal state here.

## Required contents for every checkpoint

1. Current owner authorization, pause/stop state and exact next bounded action.
2. Source/build SHA and artifact identity, separate from documentation HEAD; build
   number, timestamp, preview URL and verification evidence. No inferred publication.
3. Observed worktree path, branch, common Git directory, registry locator, lane ID,
   owner, expiry and dirty paths. Machine paths are observations, not portable defaults.
4. Complete request ledger: VERIFIED / PARTIAL / OPEN / BLOCKED / DEFERRED, evidence,
   next action and blocker resolution. Never turn missing work green by omission.
5. Simple worker table: actual harness/model/reasoning, lane, native run ID, changed
   files/commits, delivered output and tests. Planned routing is not actual execution.
6. Checks actually run, failures, source-to-runtime proof, preserved partial work,
   asset/source links and exact command denials. No credentials or private sessions.
7. Services/automations left active or stopped and how to verify their identity.

## Takeover guard

Read current owner instructions first. Bootstrap AKP natively, including adoption check
and receipt audit. Do not borrow another harness's receipt or identity. Read the same
canonical shared skills through native adapters; file visibility is not proof of use.

Resolve the assigned lane with `project-routing.mjs resolve`. Compare the returned path,
branch, common database, owner, expiry and HEAD to `git status --short --branch`,
`git rev-parse --show-toplevel --git-common-dir HEAD` and `git worktree list --porcelain`.
If stale, dirty unexpectedly, expired or owned by someone else, preserve and reconcile.
An integrator explicitly transfers ownership/registers scope; the worker cannot silently
rename itself Codex, renew its own authority, weaken guards or create a fallback clone.

Run the routed `pipeline:preflight` before edits and again at handoff. For a candidate,
also run `pipeline:handoff` with exact current capability evidence as required by
`docs/CONTRIBUTION_AND_RELEASE_PIPELINE.md` and `docs/CAPABILITY_HANDOFF.md`. Failed acceptance
does not forbid saving an honest checkpoint; it forbids describing it as accepted.
Use explicit-path commits only; never merge/publish from a contributor lane.

## Updating the handoff

The integrator is the sole writer of CURRENT.json. Add a checkpoint directory rather
than overwriting an earlier checkpoint. Use repository-relative links wherever possible.
Verify all local links, source/build identities, Git state and artifact hashes before
switching CURRENT. Preserve prior build folders and evidence. If only docs changed,
say so; do not relabel or rebuild a frozen game just to match a documentation commit.

On dave-gaming-pc new shared work belongs under Desktop/stuff. A physical worktree move
uses `git worktree move` from a different registered checkout, after validating both
absolute paths and ownership. Never run it from the directory being moved on Windows.
Re-read Git metadata and update the machine registry. A compatibility junction points
to the same files and is not an alternate lane. Shared Git databases and active/dirty
worktrees move only through separately bounded reconciliation.
