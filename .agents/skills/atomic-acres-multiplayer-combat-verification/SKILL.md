---
name: atomic-acres-multiplayer-combat-verification
description: Verify or red-team Atomic Acres multiplayer combat, inventory, weapons, grenades, projectiles, smoke and flash, killstreaks, drones, destructible objects, stale-life protection, exactly-once results, network chaos, reconnect and rematch, authority forgery, target-hardware performance, immutable evidence, and release acceptance.
---

# Atomic Acres Multiplayer Combat Verification

Attack named falsifiers against one immutable candidate identity; never turn implementation into verification by assertion.

## Workflow

1. Read repo rules, exact source/build identity, acceptance manifest, frozen decisions/budgets/comparators, protocol parsers, domain invariants, release topology and evidence schema.
2. Refuse an ambiguous, dirty, moving or uncommitted candidate. Confirm every reused artifact matches the candidate SHA or has proven relevant-tree parity.
3. Run the smallest pure/unit/property gates before browser, GPU and network matrices.
4. Exercise solo host+bots, two peers, and host+guest+bot across required life, deploy, combat, death, reconnect, late-join and rematch transitions.
5. Run the versioned fixed-seed impairment manifest for delay, loss, duplication and reorder with exact run length, event counts, repair deadlines and final hash equality. Recompute its digest from the independent profile oracle; never accept a copied digest claim.
6. Forge or replay ammo, reload, spin-up, projectile, effect, damage, reward, support pose/health, door/fracture and score inputs. Verify no shared result changes.
7. Run deterministic visual, accessibility, disposal and same-machine RTX stress gates with honest backend/adapter/timing labels.
8. Verify stable/benchmark bytes and preview/release lineage separately from gameplay.
9. Emit immutable evidence by requirement/falsifier ID and keep any failure, omission or threshold breach nonzero.

## Invariants

- Independence: do not self-approve the exact preview authored by the same specialist; a happy path never proves authority.
- Authority: derive outcomes from numeric event evidence. Host/client hashes and canonical exactly-once counts must converge after repair; stale life/epoch/revision/action data fails closed.
- Accessibility: verify keyboard/focus, reduced sensory modes and non-color/non-audio alternatives without changing shared outcomes.
- Performance: CI/SwiftShader proves compatibility only; RTX proof requires timestamped native hardware/backend identity and frozen absolute/delta thresholds.
- Provenance: evidence and asset records carry immutable digests and exact source/build/environment identities.
- Release: runtime/release-shell change after HITL invalidates approval; production needs workflow, Pages, receipt, byte and rendered-route agreement.

## Validate

Read [references/chaos-matrix.md](references/chaos-matrix.md), then from this skill directory run both contract fixtures:

`node scripts/run-pass65-combat-matrix.mjs scripts/fixtures/known-good.json`

`node scripts/run-pass65-combat-matrix.mjs scripts/fixtures/incomplete.json`

`node scripts/run-pass65-combat-matrix.mjs --self-test`

The first command must exit zero, the second must exit nonzero, and the self-test must reject every adversarial mutation. For a candidate matrix result, run:

`node scripts/run-pass65-combat-matrix.mjs <matrix-result.json>`

This staging runner validates a completed deterministic matrix manifest against an independent 13-scenario oracle and the exact scenario/profile cross product. It distinguishes 40-hex Git SHAs from 64-hex SHA-256 digests, requires numeric late-join and match-end repair evidence, and checks High plus Max native-hardware receipts against frozen baseline/threshold arithmetic. After B1, replace its result loader with bounded test-group orchestration while retaining these fail-closed evidence checks.
