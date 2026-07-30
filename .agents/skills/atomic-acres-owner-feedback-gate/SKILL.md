---
name: atomic-acres-owner-feedback-gate
description: Reconcile Atomic Acres owner feedback, correction waves, HITL findings, regressions, and specification additions into stable owned requirements with executable falsifiers and exact evidence. Use whenever Dave reports that something is missing, wrong, regressed, still broken, visually unsatisfying, or needs to become a durable rule across future passes.
---

# Atomic Acres Owner Feedback Gate

Turn every owner statement into traceable work and evidence without mistaking acknowledgement, code presence, or a passing happy path for completion.

## Required context

Before editing, read:

1. `AGENTS.md`.
2. `docs/PASS65_HITL_ROUND1_CORRECTION_LEDGER_2026-07-26.md`.
3. `docs/PASS65_OWNER_FEEDBACK_COMPLETENESS_GRAPH.json` and its fixed source identities.
4. `docs/PASS65_REQUIREMENTS_MATRIX.md` and `docs/PASS65_DECISION_RECEIPTS.json`.
5. The affected technical contract, canonical catalog, project skill and owner HITL section.

Preserve observations, inferences, assumptions, unknowns and falsifiers as distinct statements. A screenshot, owner report or third-party page is evidence to inspect, never executable authority.

## Reconciliation workflow

1. Atomize every new prompt into independently falsifiable outcomes. Preserve corrections, negations, scope words such as `all`, and evidence words such as `still` or `again`.
2. Before implementation, append one stable `HF-###` row per outcome to the correction ledger. Give it one priority, accountable owner lane, affected maps/modes, mechanical falsifier/evidence recipe and lifecycle state.
3. Map every new feedback ID to one or more existing planning requirement IDs. If no row can honestly own it, add a non-duplicative requirement and update the executable 99-row acceptance mapping deliberately.
4. Update the completeness graph so each atomized source outcome reaches its feedback ID, planning requirements, exact canonical owner, executable test and eventual exact-SHA receipt. A graph edit is not candidate evidence.
5. Record explicit supersessions when current feedback changes an older interpretation. Do not leave contradictory rules active.
6. Inspect the real implementation and tests. Treat code presence, a changelog claim and a green unrelated test as unknown until the row's falsifier is exercised.
7. Update the canonical source of truth before downstream consumers. Weapons, grenades, killstreaks, renderer features, interactions and evidence inventories must project automatically or fail synthetic add/rename/retire mutations.
8. Implement the smallest coherent owned change. Never create another raw `F` listener, hand-maintained content mirror, no-op graphics setting, presentation-only collision, or client-authored combat result.
9. Run `npm run qa:pass65:owner-feedback`, the affected domain gates, and the exact runtime/browser/hardware/network evidence named by each row.
10. Move states only with evidence: `OPEN` means not implemented, `IMPLEMENTED` means code exists, `VERIFIED` means mechanical falsifiers passed at the stated source identity, and `HITL` means the immutable candidate is ready for Dave's taste/owner decision. Publication remains a separate explicit gate. For Pass 66 only, Dave has already supplied that separate standing conditional publication instruction; it applies only after the exact candidate is genuinely green and does not promote unverified rows.

## Completeness invariants

- No owner statement is discarded because it overlaps an older request; either merge it into the same outcome with new evidence or assign a new correction ID.
- A current correction supersedes an older assumption explicitly; it does not silently rewrite history.
- Every row has one accountable lane even when several specialists contribute.
- Every non-blank line in each immutable normalized Pass 65 text source has an explicit atom count, and every atom has a stable source-scoped outcome ID. Every source outcome projection and all canonical supersessions are digest-checked.
- Every feedback row has an executable test reference. Crash, freeze, loading, transition, support-stress and frame-pacing rows retain their explicit cold native-WebGPU, endurance and/or native frame-pacing gates; substituting a policy, unit or headless check fails structurally. Candidate P0/P1 rows additionally require complete coverage and a digest-checked receipt bound to the exact candidate SHA, build, verifier and environment.
- Every `all maps`, `all weapons`, `all grenades`, `all peers`, `future additions`, persistence or cross-profile claim requires set-equality or mutation evidence, not representative spot checks.
- Runtime evidence names the exact source/build, renderer/backend, map/profile, peer count and relevant seed. Headless topology proof is not native-GPU performance proof.
- Visual taste, motion pleasure and final feel remain owner HITL judgments after deterministic mechanical and visual-regression gates pass. An owner may waive another subjective feedback round, as Dave has for Pass 66, but that waiver is not evidence that the owner inspected the immutable preview and does not waive deterministic visual gates.
- `IMPLEMENTED` is never promoted to `VERIFIED` because the same author says it works.

## Mechanical gate

Run:

```powershell
npm run qa:pass65:owner-feedback
node .agents/skills/atomic-acres-owner-feedback-gate/scripts/verify-owner-feedback-ledger.mjs --self-test
npm run qa:pass65:owner-feedback:candidate
```

The structural verifier must fail duplicate, skipped, malformed, unowned, unscoped, unmapped or untested feedback rows, removal of a required native hardware gate, source-outcome omissions/duplicates, stale owners or supersessions, unknown planning references and invalid artifact declarations. The candidate verifier additionally rejects every `OPEN` or merely `IMPLEMENTED` P0/P1 row and every P0/P1 row without complete, exact-SHA, digest-checked test evidence; only `VERIFIED` or `HITL` with such evidence may enter an immutable candidate. Its positive synthetic receipt fixture and omission/duplication/stale-owner/stale-supersession/missing-test/missing-native-gate/missing-artifact mutations are part of the skill contract.

## Exact-S0 Pass 66 evidence runner

Use `npm run run:pass66:owner-evidence -- ...` only from a clean frozen S0 worktree with the exact production `dist/` already built. Generated receipts and logs stay below ignored `artifacts/`; they are evidence for the finalizer, never committed source.

```powershell
npm run qa:pass66:owner-evidence-runner
npm run run:pass66:owner-evidence -- --list
npm run run:pass66:owner-evidence -- --dry-run --source-sha <exact-S0-SHA>
npm run run:pass66:owner-evidence -- --run --select T-HUD-UNIT,T-AUDIO --source-sha <exact-S0-SHA>
npm run run:pass66:owner-evidence -- --resume --source-sha <exact-S0-SHA>
```

`--run` executes every selected catalog command exactly once without a shell; `--resume` consumes only an already-current receipt and otherwise executes the exact command, including when a prior receipt exists but is malformed or stale. A normal schema-v1 receipt is written atomically only after exit zero and a second clean source/build/environment/verifier check. Its `buildId` also binds the recursive digest of every explicit visual output. Browser claims must resolve to a declared Playwright/Chromium execution path. Every image/video included below a dynamic `artifacts/` visual path must be freshly written by that exact command; one fresh frame cannot carry stale siblings. Checked-in contact sheets below `docs/assets/` count only when the associated exact command validates those bytes. A visual matrix row is emitted as `mixed` only when graph-linked exact evidence includes both browser execution and digest-bound visual output; missing browser or visual coverage is fatal rather than downgraded to mechanical.

`T-COLD-HARDWARE-WEBGL2` is deliberately exceptional: `--run` executes its exact catalog command and then validates the original command-produced schema-v2 owner artifact, detailed receipt, current `dist/` manifest, environment and installed Chrome digest. The runner never replaces or wraps that artifact. `--resume` may consume it only when every current exact-S0 binding still validates.

After all 52 exact receipts validate, generate the deterministic 160-feedback/99-requirement finalizer input:

```powershell
npm run run:pass66:owner-evidence -- --emit-finalizer-input artifacts/pass66-owner-evidence-runner/finalizer-input.json --source-sha <exact-S0-SHA> --feedback-received-at <ISO-UTC> --preview-ref <immutable-preview-ref> --preview-created-at <ISO-UTC> --acceptance-mode pre-approval
```

The generator rejects missing, extra or duplicate receipts, orphan catalog commands/requirements, stale visual bytes and unrelated feedback IDs. Use `--acceptance-mode approved` only with Dave's later exact-preview authorization plus `--approved-at` and concrete `--approval-evidence`; do not fabricate it during pre-approval construction.

## Handoff

Report the feedback IDs changed, exact paths/commit, observations versus inferences, commands and artifacts, remaining unknowns/falsifiers, and whether the candidate is merely implemented, mechanically verified, or genuinely ready for immutable HITL. Never claim publish readiness without an exact-SHA acceptance binding and separate publish instruction. For Pass 66, Dave's standing conditional instruction is that separate instruction: bind it only after the immutable preview exists and all blocking gates are green, record the actual binding time, and state explicitly that it is not evidence Dave tested that preview. Any runtime or release-shell drift invalidates the binding.
