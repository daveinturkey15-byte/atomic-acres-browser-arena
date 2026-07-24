# Release acceptance manifests

Every `runtime` or `release-shell` contribution for Pass 62 or later must add or
update exactly one `acceptance/pass-<number>.json` manifest. The manifest is the
release-blocking map from Dave's feedback to evidence; a green test suite is not
a substitute for it.

Use `example.json` as the shape. Requirements are numbered `R1..Rn` without
gaps and each records:

- the expected user-visible result;
- a falsifier that would prove the requirement is still wrong;
- whether acceptance is mechanical, visual, human, or mixed;
- concrete evidence references and exact commands;
- `verified`, or an explicit `deferred` decision approved by Dave.

Visual requirements need both a served-browser check and a visual artifact.
Human approval names the immutable preview SHA and timestamp. After that
preview, only process/manifest changes may be added; any runtime or release-shell
change invalidates approval and requires a new preview.

CI uploads the exact `dist/` tree as
`pr-preview-<pr>-<head-sha>` even when the human-acceptance gate is still
pending. After Dave tests that candidate, update only the manifest with the
preview receipt and approval, then push the approval commit.

The gate is run directly so it also works before package scripts change:

```text
node scripts/release/acceptance-gate.mjs --phase ci --impact full --base <base-sha> --head <head-sha>
node scripts/release/acceptance-gate.mjs --phase release --pass "PASS 62"
```

Passes below the policy's `enforceFromPass` remain reproducible for rollback,
but their release receipt is explicitly marked `legacyExempt`.
