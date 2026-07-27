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
10. Move states only with evidence: `OPEN` means not implemented, `IMPLEMENTED` means code exists, `VERIFIED` means mechanical falsifiers passed at the stated source identity, and `HITL` means the immutable candidate is ready for Dave's taste/owner decision. Publication remains a separate explicit gate.

## Completeness invariants

- No owner statement is discarded because it overlaps an older request; either merge it into the same outcome with new evidence or assign a new correction ID.
- A current correction supersedes an older assumption explicitly; it does not silently rewrite history.
- Every row has one accountable lane even when several specialists contribute.
- Every non-blank line in the fixed attached Pass 65 source has an explicit atom count, and every atom has a stable outcome ID. The fixed outcome projection and all canonical supersessions are digest-checked.
- Every feedback row has an executable test reference. Candidate P0/P1 rows additionally require complete coverage and a digest-checked receipt bound to the exact candidate SHA, build, verifier and environment.
- Every `all maps`, `all weapons`, `all grenades`, `all peers`, `future additions`, persistence or cross-profile claim requires set-equality or mutation evidence, not representative spot checks.
- Runtime evidence names the exact source/build, renderer/backend, map/profile, peer count and relevant seed. Headless topology proof is not native-GPU performance proof.
- Visual taste, motion pleasure and final feel remain owner HITL judgments after deterministic mechanical and visual-regression gates pass.
- `IMPLEMENTED` is never promoted to `VERIFIED` because the same author says it works.

## Mechanical gate

Run:

```powershell
npm run qa:pass65:owner-feedback
node .agents/skills/atomic-acres-owner-feedback-gate/scripts/verify-owner-feedback-ledger.mjs --self-test
npm run qa:pass65:owner-feedback:candidate
```

The structural verifier must fail duplicate, skipped, malformed, unowned, unscoped, unmapped or untested feedback rows, source-outcome omissions/duplicates, stale owners or supersessions, unknown planning references and invalid artifact declarations. The candidate verifier additionally rejects every `OPEN` or merely `IMPLEMENTED` P0/P1 row and every P0/P1 row without complete, exact-SHA, digest-checked test evidence; only `VERIFIED` or `HITL` with such evidence may enter an immutable candidate. Its positive synthetic receipt fixture and omission/duplication/stale-owner/stale-supersession/missing-test/missing-artifact mutations are part of the skill contract.

## Handoff

Report the feedback IDs changed, exact paths/commit, observations versus inferences, commands and artifacts, remaining unknowns/falsifiers, and whether the candidate is merely implemented, mechanically verified, or genuinely ready for immutable HITL. Never claim publish readiness without Dave's exact-SHA approval and separate publish instruction.
