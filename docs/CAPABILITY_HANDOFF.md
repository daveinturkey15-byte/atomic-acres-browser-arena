# Capability handoff enforcement

Final candidate handoff uses `npm run pipeline:handoff -- --machine <machine> --harness <harness> --project atomic-acres-browser-arena --lane <lane-id>` after the final commit and evidence rebind. This retains contribution route, clean-tree and ancestry checks and creates a receipt only after live capability verification. Ordinary preflight remains available before rebind.

Normal execution of `scripts/orchestration/publish_pass96.py` independently invokes `scripts/release/capability-handoff-check.mjs` in its own candidate checkout before build guards or outward mutation. It accepts no saved GREEN receipt. Dry-run (the actual flag is `--dry-run`) and rollback remain independent. GitHub release CI requires no private vault or AKP roots. Existing product acceptance, owner approval, CI and release restrictions remain unchanged.

The committed `.github/project-identity.json` policy names required adopted capabilities and pins the reviewed validator bytes. Do not change its hash to clear failed evidence; a validator upgrade requires explicit review. The existing machine-local project-routing registry supplies a `capabilityHandoff` object with absolute paths for:

- `executable`: the trusted local Python executable.
- `checker`: the governed `capability_record_check.py` matching the committed SHA-256.
- `recordsRoot`: capability-record JSON directory.
- `evidenceRoot`: capability evidence directory, including referenced raw files.
- `skillRoot`: canonical skill store.
- `akpRoot`: active AKP root.

No private machine paths belong in committed configuration. The executable and machine registry are trusted local operator configuration; this gate does not defend against a compromised interpreter or operating system. Existing routing validation still applies. Missing configuration fails final handoff and normal publication, while contribution, preservation and backup remain available.

Each required record must be adopted. The validator is executed directly with actual clean Git HEAD and explicit roots, and must return exit 0 plus its actual GREEN summary for exactly one adopted record at that HEAD. Syntax/research-only exit 3, cached claims, changed checker bytes and contradictory RED output fail. The trusted validator checks source/consumer hashes and committed content. The handoff extension additionally requires passing, same-HEAD evidence wrappers with nonempty raw evidence, verifies every raw file's hash and HEAD binding, confines proof paths to the real evidence root, and detects observed input drift before receipt creation.

This proves file provenance and validator results. It does not prove that recorded commands ran or that measurements are truthful; the raw tests/runtime collection and independent product acceptance remain required. A merge changes HEAD and requires rebind before normal publication.

Both static-and-unit CI jobs run `npm run qa:delivery-contracts` before the runtime unit suite. These process-boundary fixtures need no private roots.

Focused checks: `node --test scripts/release/capability-handoff.test.mjs` and `python -B scripts/orchestration/publish_pass96_handoff_test.py`. The latter uses fail-fast spies and never publishes. `pipeline-guard.mjs doctor --offline` is available for synthetic ancestry tests; it reports auth and tool versions as skipped, never authenticated. Other modes reject `--offline`.
