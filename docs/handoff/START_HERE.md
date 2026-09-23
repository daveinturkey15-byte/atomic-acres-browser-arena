# Atomic Acres — start here

**VERIFIED workspace:** `C:/Users/david/Desktop/stuff/atomic-acres` on dave-gaming-pc.
This is the original Git worktree moved intact, not a new clone. The former
`C:/Users/david/projects/aa-world-studio` is only a compatibility junction to it.

**[Open the readable handoff](index.html)** · **[Play Build 19](http://127.0.0.1:41996/updates/slice19/)**

[Current cross-harness adoption and remaining parity issues](PARITY_STATUS.md).

The game menu contains both Nuke Town New World and Skills Lab. Build 19 remains frozen
at source `82677da2c8e910f4bcdebcc804c434e874439c9e`; documentation commits after it are
not new game builds. Visual quality, long-duration performance and release acceptance
remain OPEN. This is a local checkpoint, not a production release.

## Give the next worker this

> Open C:/Users/david/Desktop/stuff/atomic-acres. Read AGENTS.md and
> docs/handoff/START_HERE.md, CURRENT.json and CONTRACT.md. Read the Build19 handoff,
> all 60 request states, worker receipts and unresolved gates. Bootstrap your native
> harness against shared AKP and skills. Verify the actual routing, worktree, branch,
> HEAD, common Git database, dirty state and lane owner/expiry before writing. Arrange
> an explicit ownership transfer and bounded lease if necessary; do not copy the repo,
> reuse Codex's identity or start a new branch just because the harness changed.
> First report the checkpoint you found and your proposed bounded next task. Resume
> development only when I authorize it. Maintain this same handoff location and format.

## Read in order

1. [Current checkpoint and paths](CURRENT.json), then [handoff contract](CONTRACT.md).
2. [Build19 technical handoff](checkpoints/build19/HANDOFF.md).
3. [All 60 requests and their states](checkpoints/build19/OWNER_REQUESTS.md).
4. [Workers, exact routes and quota limits](checkpoints/build19/AGENTS_AND_USAGE.md).
5. [Original screenshots, hashed recovery archive and receipts](../../.handoff-evidence/work/continued-world-20260913/handoff/index.html).
6. [All 18 owner concept images](../../.handoff-evidence/work/fresh-world-20260912/references/).

The `.handoff-evidence` directory is a local, ignored artifact bundle inside this
project. Its 64 migrated files were SHA256-checked against the originals. A fresh
Git clone contains the contract and text checkpoint, but needs that bundle separately
for screenshots and dirty-lane recovery; do not call a clone a complete backup.
The old Codex artifacts are preserved historical evidence, not a second current tracker.

## Routing before work

Machine authority: `C:/Users/david/AppData/Local/atomic-acres-browser-arena/project-routing.json`.
Run from any directory, substituting your real registered lane/harness:

```powershell
node C:/Users/david/projects/atomic-acres-integration/scripts/release/project-routing.mjs resolve --project atomic-acres-browser-arena --lane <registered-lane> --machine dave-gaming-pc --harness <native-harness>
```

Then run `pipeline:preflight` from the returned worktree with the same identity.
Refusal means reconcile registration/ownership, not choose an older pass checkout.
`CURRENT.json` is an observation; the routing record and Git readback must agree.
Before candidate acceptance, the separate `pipeline:handoff` capability gate is
mandatory. A migration/preflight success is not candidate acceptance.

## Preserved infrastructure exceptions

- Common Git database: `C:/Users/david/Documents/Codex/2026-09-09/atomic-acres-weekly-audit/work/integration-full/.git`.
  Other worktrees share it. It was not moved or duplicated in this bounded migration.
- Integration launcher and other registered/dirty/protected lanes retain their paths.
  The 30-lane inventory is historical evidence; re-enumerate Git before any action.
- Shared AKP and vault skill roots retain their governed locations. Harness-specific
  sessions and credentials stay private; project code, requests and handoffs do not.

Game workers and continuation automation remain stopped. The preview and AETHERIS are
left running. Provider capacity snapshots in the checkpoint may be stale; verify before
dispatch and never treat a planned model route as a successful native run.
