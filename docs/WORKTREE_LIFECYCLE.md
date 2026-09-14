# Worktree lifecycle + control-state boundaries (DRAFT for live-line adoption)

Owner direction 2026-09-14: after the 51-worktree / pass-73-vs-96 drift incident.
Target home (repo-owned so every harness picks it up): `docs/WORKTREE_LIFECYCLE.md`
+ teeth in `pipeline-guard`/`project-routing` + pointer in `AGENTS.md`.
Curve: this repo's 54 dirty paths are real lane edits (no model-swap-in-repo
pattern found here), so this adopts caps + lifecycle + rescue + manifest —
not control-state surgery we don't need.

## 1. Invariants

- One worktree per genuinely independent active task. Related subagents share
  the task's worktree (never one worktree per thought/thread/chat).
- Soft cap 8 live worktrees, 10–12 during a burst. The spawner refuses worktree
  N+1 until one is archived (commit → push → archive → prune metadata).
- One writer per lane. Never clean/reset/stash/move/delete another task's tree.
- Model/reasoning routing is control-plane state, never edits inside worktrees.

## 2. Finish protocol (every task end, success or abandoned)

1. commit → push (checkpoint branch if PR premature)
2. record receipt (PR URL + HEAD SHA + gate evidence) in the run ledger
3. archive the worktree once clean + pushed + inactive; prune metadata

Abandoned work is preserved then archived — never reverted blind.

## 3. Dirty-path classification (before ANY cleanup)

REAL_WORK / CONTROL_NOISE / GENERATED / TEMP_BUILD / UNKNOWN.
UNKNOWN is preserved, never auto-reverted. A cleanup ends with a manifest:
preserved / pushed / classified-noise / proposed-deletions.

## 4. Circuit breakers (guard refuses, human decides)

- detached HEAD > 0 → WARN + auto-rescue-branch (no deletion)
- local-only commits > 0 past 24h → push checkpoint branches
- live worktrees > 10 → block new worktrees
- UNKNOWN dirty > 0 → block automatic cleanup
- base pass < latest release pass → refuse new lane, point at live tip
  (this exact check would have caught the pass-73/96 incident at lane creation)

## 5. Evidence

- `repo-state/snapshot.mjs`: 6-second read-only dashboard (cards + table).
  Run before any swarm and after any correction; keep both JSONs.
- Preflight stays fail-closed; ancestry allowlist stays explicit-review-only.
