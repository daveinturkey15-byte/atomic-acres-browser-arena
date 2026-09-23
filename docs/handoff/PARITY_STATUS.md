# Shared harness status — 13 September, 16:52 UK

VERIFIED: all eight tested native bootstrap adapter files route into AKP and match
the operational vault's canonical adapter store. Their shared machine behaviours
point to Desktop/stuff and the same handoff format. The bootstrap contract check passed.
This includes Codex, Claude Code, OMP, Antigravity CLI/IDE and Hermes entry points.

| Harness | Shared rules discovery | Native adoption at final audit |
|---|---|---|
| Codex | VERIFIED | VERIFIED after reading the concurrently updated native adapter and re-attesting |
| Claude Code | VERIFIED | VERIFIED: no failure row in the final audit |
| OMP | VERIFIED | OPEN: re-read changed controls, then native challenge/attest |
| Antigravity / AGY | VERIFIED | OPEN: re-read changed controls, then native challenge/attest |
| Hermes | VERIFIED | OPEN: re-read changed controls, then native challenge/attest |
| Hermes Desktop | VERIFIED via shared bootstrap | OPEN: expired/quarantined historical receipt needs native renewal |
| Continue / dsh | Shared skill route checked earlier | OPEN: skill visibility does not register an adopted harness |

No other harness was launched or impersonated to renew a receipt. Existing sessions
must reload; a changed file does not prove hot adoption. Native attestations record
bootstrap adoption, not successful execution of every tool, provider or skill.

OPEN: the latest broad parity check remains RED. During concurrent skill work it found
a `reference-image-catalog` target/content mismatch in six discovery routes, catalogue
drift and 24 skill-regression issues. Earlier in this migration the seven skill routes
passed with 169 entries; that earlier snapshot must not be treated as a current green
certificate. Preserve these failures and reconcile with the skill's current owner.

The report also inventories 785 repositories/worktrees outside Desktop/stuff, including
historical Atomic Acres lanes. Those are registered migration exceptions, not permission
to move active work or delete shared Git databases.

[Saved 16:49 broad check](../../.handoff-evidence/migration/parity-1649.md) predates the
final Codex re-attestation. Current machine report:
`C:/Users/david/AppData/Local/Akephalos/harness-parity/latest.md`.

The shared rule is saved and remotely verified in AKP commit
`722d3d8a64bf428bdfa8109fb853bd6fe4b499fd`. Subsequent native receipts may add commits.
