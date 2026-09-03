# Gotcha drafts — 2026-09-03

All notes are DRAFT, sourced from `docs/PASS84_OWNER_FEEDBACK_2026-09-02.md` (HF-434..HF-444, PASS 92 publish record) unless an evidence gap is noted in the file.

| File | One line |
|---|---|
| `z-fighting-flat-map-depth-quantum.md` | Authored +0.02 m offsets sit inside the depth quantum at 60–80 m (near 0.02 / far 180); fix with integer polygonOffset tiers. |
| `changelog-must-name-pass.md` | The changelog title/summary must name the pass or the HF-406 identity surface check fails at the cut. |
| `capture-tool-repo-relative-manifest-paths.md` | Capture tooling expects `<capture-dir>/<arena>/<camera>.png`; manifests must use repo-relative paths (ledger evidence gap — SUSPECTED). |
| `coplanar-instrument-presentation-only-skip.md` | The coplanar instrument silently skipped all presentationOnly meshes and reported "skipped: 0"; they are now listed as UNAUDITED. |
| `menu-boot-90s-wait-flake.md` | Menu boot can exceed the 90 s wait after 12 consecutive boots; standalone re-run passed — watch item, not a Terminal fault. |
| `cmd-batch-crlf-call-label.md` | cmd.exe batch files need CRLF line endings for `call :label` to work; LF-only launchers misbehave (ledger evidence gap — SUSPECTED). |
| `omp-credential-store-empty-fail-fast.md` | The OMP credential store (agent.db) came back empty and wiped the chain's auth; every OMP job must fail fast on "No API key found" instead of looping. |
