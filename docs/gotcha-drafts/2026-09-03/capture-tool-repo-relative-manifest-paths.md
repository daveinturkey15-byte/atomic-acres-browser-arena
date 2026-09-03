# DRAFT: Capture tooling expects <capture-dir>/<arena>/<camera>.png; manifests must use repo-relative paths

Date: 2026-09-03

**Symptom.** The deterministic capture gate broke when capture manifests referenced absolute paths from another worktree, and when the on-disk layout did not follow the doubled-directory convention the capture tooling expects.

**Cause (SUSPECTED).** The capture tooling resolves captures at `<capture-dir>/<arena>/<camera>.png` (the doubled directory — capture dir, then arena — is the convention), and the manifest paths must be repo-relative so they resolve regardless of which worktree the gate runs from; absolute paths from the worktree that produced the captures pin the gate to that worktree and fail elsewhere. *Evidence gap: no ledger line in `docs/PASS84_OWNER_FEEDBACK_2026-09-02.md` HF-434..HF-444 or the PASS 92 publish record covers this finding; drafted from the 2026-09-03 Q4 job candidate text only.*

**Correction.** Emit capture manifests with repo-relative paths, keep the `<capture-dir>/<arena>/<camera>.png` layout, and never copy absolute worktree paths into a manifest.

**Verify.** Run the capture gate from a different worktree than the one that produced the captures: it must still resolve every manifest entry; a synthetic manifest with an absolute path must fail the gate rather than resolve silently.
