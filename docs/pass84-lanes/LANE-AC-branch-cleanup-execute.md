# Lane AC — execute the branch and worktree consolidation plan (owner-approved 14:10: "get 84 live then do that")

Orchestrator: Claude Code (Fable 5.1). Prerequisite: Lane S's report
`docs/BRANCH_CONSOLIDATION_AUDIT_2026-09-02.md` exists on the integration
branch and lists SUPERSEDED / STRANDED / UNKNOWN per branch with a plan.

Worktree: run from `C:\Users\david\projects\aa-omp-pass84` (git operations
only; you do not edit source).

## Rules (the owner approved deletion of superseded work, tagged first)
1. TAG EVERYTHING before deleting: `git tag archive/<branch-name-with-slashes-as-dashes> <branch>`
   for every branch you will delete; push the tags (`git push origin --tags`)
   so nothing is lost even if a local worktree dies.
2. Delete only branches Lane S classified SUPERSEDED (every hunk present or
   replaced on the shipping line) or fully MERGED. Never delete STRANDED or
   UNKNOWN; list them for the owner with what they hold.
3. Remove worktrees whose branch was deleted or is fully merged
   (`git worktree remove --force <path>`; `git worktree prune`), EXCEPT:
   `atomic-acres-gauntlet` (frozen), `pass74-parked` (only copy of something),
   every `aa-claude-*`, `aa-map3`, `aa-farcrysis-load`, `aa-omp-pass8*`,
   `aa-gemini-audit` (live lanes), and anything with uncommitted changes
   (report those instead).
4. Fast-forward `main` to the shipping head once PASS 87 is published
   (`git branch -f main <head>` is NOT enough: check `git merge-base
   --is-ancestor origin/main <head>` first, then `git push origin <head>:main`
   only if it is a fast-forward; if main has diverged, STOP and report).
5. Idempotent, logged: write every command and its result to
   `docs/BRANCH_CONSOLIDATION_EXECUTION_2026-09-03.md`, commit it.
6. Never touch remote branches other than deleting the local-only ones
   Lane S marked; remote branch deletions are listed for the owner, not run.

## Report
Counts: tagged, deleted, worktrees removed, worktrees kept (and why),
STRANDED list, main fast-forward result. Claim-state every line.
