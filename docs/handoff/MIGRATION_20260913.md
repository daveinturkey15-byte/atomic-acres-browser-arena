# Shared workspace migration — 13 September 2026

VERIFIED: the original clean worktree at source `82677da2c8e910f4bcdebcc804c434e874439c9e`
moved with `git worktree move` to `C:/Users/david/Desktop/stuff/atomic-acres`.
Its branch is still `contrib/dave-gaming-pc/codex/world-studio-20260912`.
The old path is a junction to this same directory, not a second checkout.
The machine registry now resolves the new path. Routed preflight passed at
`artifacts/pipeline/20260913T153002104Z-contribute.json` before documentation edits.

VERIFIED: 64 selected handoff, research, concept and recovery files were copied into
`.handoff-evidence`; each SHA256 matched its original. Includes all 18 concept images,
60 request states and the preserved partial-lane archive. Originals remain historical
evidence. A fresh clone does not include the ignored artifact bundle.

VERIFIED: the preview server was restarted on the same loopback port41996, now serving
the moved directory. The 77 files in Build19's saved HTTP manifest match both the
local output and served response. This was a migration, not a runtime rebuild.
Recheck current process identity before stopping/restarting anything; the migration
server was PID46136. AETHERIS and game-worker stop state were preserved.

VERIFIED: shared bootstrap verifier passes; seven filesystem routes expose the same
169 skills (Codex, Claude Code, OMP, Antigravity, Hermes, Continue and dsh).
Codex completed its own native challenge/attestation after the rule change.
OPEN: other harnesses must reload the changed rules and renew their own receipts.
Existing catalogue/regression/adoption issues were not cleared by this task.

OPEN: historical worktrees and the common Git database remain at their registered
locations, because other lanes share them. Do not delete the former Codex integration
workspace; this game's .git pointer still depends on that common database.
This is a shared project home migration, not relocation of every project on the PC.

## Recovery and verification

Local receipts and the read-only verifier live at
`C:/Users/david/Desktop/stuff/handoffs/atomic-acres/migration-20260913`.
The directory contains `routing-before.json`, `copied-artifacts.json`, native Codex
challenge/proof and `verification.json`. The pre-move registry is recovery evidence,
not something to restore blindly after a later ownership transfer.

Symptom → Git reports Permission denied when moving a Windows worktree.
Cause → invoking `git -C <the-source-worktree> worktree move` holds that working directory.
Correction → invoke the Git-aware move from another registered checkout of the same
database after checking absolute paths and quiescing only the owned preview.
Verify → actual move succeeds, old path is a compatibility junction, Git metadata and
the routed preflight resolve the new path, and served artifact hashes are unchanged.

The hidden Python preview also needs redirected stdout/stderr: a pythonw HTTP server
without writable logging streams can accept a socket then close the request. The final
server has explicit task-local stream files and passed the HTTP hash verification.
