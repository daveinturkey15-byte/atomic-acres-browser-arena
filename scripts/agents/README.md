# Gemini workhorse runner

`gemini-workhorse.py` gives Atomic Acres a project-local, auditable lane for using exactly **Gemini 3.6 Flash High** as a bounded primary implementer while keeping final review, integration, push, and deployment separate.

This is deliberately **not** the historical Gemini-exclusive experiment. In this workflow Gemini performs most of a bounded implementation, then Codex reviews the resulting diff, reproduces relevant tests, and may refine defects before committing.

## Safety and provenance contract

The runner:

- pins `gemini-3.6-flash-high` with high effort and requests no fallback;
- exposes only one named, isolated Git worktree;
- refuses detached branches and dirty starts by default;
- requires explicit changed-path globs for write mode;
- never commits, pushes, merges, deploys, or handles credentials;
- strips the poisoned host `PYTHONPATH` before launching AGY;
- kills the complete Windows process tree on timeout;
- records the frozen prompt, AGY executable hash/log, exact revision, branch, status before/after, binary diff, stdout/stderr hashes, duration, PID, and a unique run ID under the Hermes cache;
- fails closed on timeout, non-zero exit, empty output, Git HEAD mutation, path-boundary escape, or a missing exact-model receipt.

A clean receipt proves the requested invocation and local effects. It does not prove that Gemini's claims are true; the reviewer must reproduce material tests and inspect the actual diff.

## Invocation

Use the system Python because the host Hermes `PYTHONPATH` is not suitable for external scripts:

```bash
unset PYTHONPATH
'C:/Users/david/AppData/Local/Programs/Python/Python312/python.exe' \
  scripts/agents/gemini-workhorse.py \
  --repo "$PWD" \
  --mode plan \
  --tag harness-smoke \
  --prompt scripts/agents/prompts/harness-smoke.md
```

For an implementation run, declare every permitted path boundary:

```bash
unset PYTHONPATH
'C:/Users/david/AppData/Local/Programs/Python/Python312/python.exe' \
  scripts/agents/gemini-workhorse.py \
  --repo "$PWD" \
  --mode write \
  --tag pass56-skyline-live-readability \
  --timeout-seconds 1800 \
  --allow-path 'src/**' \
  --allow-path 'tests/**' \
  --allow-path 'docs/PASS56_*' \
  --prompt scripts/agents/prompts/pass56-skyline-live-readability.md
```

Receipts are written outside Git at:

```text
%LOCALAPPDATA%\hermes\cache\atomic-acres-agy-runs\<run-id>\
```

## Prompt quality checklist

A workhorse prompt should contain:

1. one bounded user-visible outcome, not a broad invitation to “improve everything”;
2. observed evidence and exact reproduction steps;
3. authoritative constraints and protected gameplay contracts;
4. allowed paths and explicit exclusions;
5. measurable acceptance gates;
6. commands Gemini should run itself;
7. a required concise handoff naming changed files, test output, unknowns, and the exact-model receipt.

## Reviewer loop

1. Start from a clean isolated branch and commit the runner/prompt before write mode.
2. Run Gemini once with a frozen bounded prompt.
3. Read the receipt before trusting the report. Stop on any boundary or provenance failure.
4. Inspect the real diff and independently reproduce changed-surface tests.
5. Refine only verified shortcomings; do not rewrite sound Gemini work merely for style.
6. Run repository lint, unit, build, browser/evidence, and `git diff --check` gates appropriate to the change.
7. Commit, push, and publish only after the normal human-authorized release process.

## Gotchas

- **Symptom:** AGY says it used the right model, but there is no auditable run context. **Cause:** answer text was treated as provenance. **Correction:** use this runner and preserve `receipt.json` plus `agy.log`. **Verify:** receipt pins the executable hash, exact model argument, run ID, prompt hash, and before/after revision.
- **Symptom:** a timed-out AGY run leaves `node.exe`/`agy.exe` children alive. **Cause:** only the parent process was terminated. **Correction:** the runner uses Windows `taskkill /T /F`. **Verify:** the receipt marks timeout and the child process tree is absent.
- **Symptom:** Gemini changes unrelated project files. **Cause:** a broad workspace prompt had no mechanical boundary. **Correction:** declare `--allow-path` globs and use a dedicated worktree. **Verify:** `boundary_violations` is empty before review begins.
