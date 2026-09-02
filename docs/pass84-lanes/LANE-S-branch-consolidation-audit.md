# Lane S — branch and worktree consolidation: salvage audit (read-only) and retirement plan

Orchestrator: Claude Code (Fable 5.1). Owner 2026-09-02 07:05 and 14:10:
"I want all of these branches/worktrees consolidated and merged", "yeah that
sounds good, get 84 live then do that". Deletions happen only from the plan
this lane produces, executed by the orchestrator after PASS 84 is live and
after tagging.

Worktree: `C:\Users\david\projects\aa-gemini-audit` (detached, read-only
checkout; move it to the current shipping head first:
`git checkout --detach <pass84 head>`)
Output: `docs/BRANCH_CONSOLIDATION_AUDIT_2026-09-02.md` (write it in the
integration worktree `C:\Users\david\projects\aa-omp-pass84` and commit it
there with explicit paths; nothing else in that worktree may be touched).

## Facts (measured 14:05)
- 402 worktrees, 389 local branches; 295 not merged into the shipping line
  (246 are `contrib/dave-gaming-pc/codex/*`, 13 hermes, 9 claude, 5 agent,
  4 codex, 3 desky, 3 backup); 94 fully merged.
- `origin/main` = 506d6142 (2026-08-21) is a strict ancestor of the shipping
  line, 388 commits behind, 0 ahead: fast-forward is lossless.
- The shipping line lineage: main -> gauntlet/pass79-omp-20260823 ->
  contrib/dave-gaming-pc/omp/pass83-lobby-identity -> pass84-overnight.
- Known stranded work found before: 2026-08-23 `codex/pass74-next` (readable
  killstreak selector, chopper gunner controls, low-health audio, wallbang
  locks), `codex/pass75-high-seas-preview-provenance`,
  `codex/pass75-mobile-compact-six-card-fix`, and Dave's own commit
  `19d6586d` - most later landed by other routes; verify, do not assume.
- The parked broken extraction `C:\Users\david\projects\pass74-parked\` is
  the ONLY copy of something; never delete it. `atomic-acres-gauntlet` is
  frozen; leave it.
- Lane C's method for old farcrysis branches is the model: `git cherry`,
  file-set diff against the shipping tree, then per-feature judgement.

## Job (READ-ONLY except the one report file)
1. For every branch not merged into the shipping line: last commit date,
   author/harness, commits ahead, files changed vs the shipping tree, and a
   one-line judgement: SUPERSEDED (every hunk already present or replaced on
   the shipping line), STRANDED (owner-visible work not present anywhere -
   name it), or UNKNOWN (needs a human look). Use `git cherry -v <ship> <branch>`
  and `git diff <ship>...<branch> --stat`; for STRANDED candidates read the
   diff. Batch the 246 Codex branches by pass number.
2. For every worktree: path, branch, dirty or clean, on disk size class,
   whether the branch is merged. Flag worktrees whose branch is fully merged
   (retire), whose directory is missing (prune), and whose branch is
   STRANDED (keep until salvaged).
3. Produce the plan: (a) `git tag archive/<branch>` for every branch to be
   deleted, then delete; (b) `git worktree remove` list; (c) fast-forward
   `main` to the shipping head; (d) the STRANDED salvage list with the
   exact files/hunks per item for a follow-up lane; (e) what to do with the
   two release mechanisms. Give exact commands in order, idempotent, with a
   dry-run mode. Do NOT run any of them.
4. Commit only the report.

## Boundaries
Read-only apart from the report. No builds, no browsers, no tests. Never
touch lane worktrees or `pass74-parked`. If a command would take longer than
a minute per branch, sample and say so.

## Report
Counts per class, the STRANDED list with names, the plan path, anything you
could not classify. Claim-state every line.
