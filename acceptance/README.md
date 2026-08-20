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

`status: accepted` means the release gate accepts the manifest. It does not by
itself mean that Dave completed owner HITL, inspected a preview, or accepted the
player-visible result. Those claims belong in the numbered requirements and
must match their evidence and state.

Visual requirements need both a served-browser check and a visual artifact.
Human authorization normally names an immutable preview SHA and records
`kind: preview-approval` with `previewInspection: performed`. After that preview,
only process/manifest changes and non-shipping test corrections may be added;
any shipped runtime or release-shell change invalidates approval and requires a
new preview. Existing schema-v1 manifests without `kind` retain the original
post-preview timestamp rule for rollback compatibility.

When Dave explicitly orders publication before his public-build HITL, the
manifest may instead record `kind: standing-publication-authorization` with
`previewInspection: not-performed`. That form must include the exact structured
`releaseDecision` enforced by the gate, explicitly disclaim preview inspection,
and retain a deferred human public-HITL requirement. Its authorization timestamp
may precede preview creation because the gate binds it mechanically to the final
preview SHA and still rejects every later runtime or release-shell change. It is
publication authority, not visual or experiential acceptance.

CI uploads the exact `dist/` tree as
`pr-preview-<pr>-<head-sha>` even when the human-acceptance gate is still
pending. After Dave tests that candidate, or after a standing publication-first
authorization is bound to it, update only process/manifest paths with the exact
preview receipt, then push the finalizer commit.

The gate is run directly so it also works before package scripts change:

```text
node scripts/release/acceptance-gate.mjs --phase ci --impact full --base <base-sha> --head <head-sha>
node scripts/release/acceptance-gate.mjs --phase release --pass "PASS 62"
```

Passes below the policy's `enforceFromPass` remain reproducible for rollback,
but their release receipt is explicitly marked `legacyExempt`.
