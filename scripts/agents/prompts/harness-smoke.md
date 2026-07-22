Review only these project-local Gemini workhorse materials:

- `scripts/agents/gemini-workhorse.py`
- `scripts/agents/README.md`
- `package.json`

Do not edit files. Determine whether the runner reliably enforces the stated exact-model, no-fallback, isolated-worktree, path-boundary, timeout, and evidence contract on Windows. Identify concrete defects rather than style preferences. Check the CLI invocation against the locally installed AGY interface if available.

Return:

1. `VERDICT`: PASS or FAIL.
2. `BLOCKERS`: only defects that make a write run unsafe or unauditable.
3. `IMPROVEMENTS`: up to five bounded improvements.
4. `MODEL RECEIPT`: exact model, fallback status, files inspected, and commands actually run.
