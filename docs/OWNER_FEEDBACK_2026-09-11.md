# Owner feedback — 11 September 2026

This continuation records new feedback in the existing HF namespace. It is linked from `PASS65_OWNER_FEEDBACK_COMPLETENESS_GRAPH.json`. The legacy guard covers HF-001 through HF-314 only; its green result does not cover the later feedback corpus. HF-315 through HF-565 remain historical coverage debt to reconcile, not implicitly accepted. HF-999 is a synthetic publisher-test fixture, not an allocated feedback row.

## HF-566 — Ephemeral lobby identity

VERIFIED direct owner instruction in the delivery-repair task: "room codes shouldnt be re usable, they should be ephemeral" and "no lasting link beyond the life spam of the lobby, between the keys and the games, of the host/roomcode/lobby itself".

| ID | Priority | Expected result | Owner | Falsifier | Scope | State |
| --- | --- | --- | --- | --- | --- | --- |
| HF-566 | P1 | Room codes and host/lobby/game/resume-key associations exist only for one lobby lifetime. A new lobby has a fresh identity. Closing or expiring a lobby invalidates admission and clears its saved associations. | delivery-integration-20260911 / Codex integrator | Create-close-create reuses a code; an expired identity is restored; stale credentials enter a later lobby; closed-lobby host or guest keys remain reusable. | All browser private lobbies and maps; same-live-lobby recovery and succession retained | OPEN |

The planning requirement is `LOBBY-LIFETIME-001` in `OWNER_FEEDBACK_CONTINUATION.json`; it is not an unrelated audio or visual requirement borrowed from an older matrix.

### Frozen lifecycle decisions

- A new lobby uses a new cryptographically random whole room identifier. There is no permanent host code or directory mapping a host to future games. Creating a lobby cannot prefer an old room identifier merely because storage remembers it.
- The whole random room identifier is the lobby incarnation and PeerJS routing id. Only a validated, unexpired checkpoint can request recovery of that same still-live lobby. An ordinary new-host action cannot reclaim an old code. Recovery and successor promotion preserve the existing live lobby; a completed round alone is not lobby destruction.
- Deliberate host close/reset destroys that lobby's admission state and clears saved host code/checkpoint plus connected guest identity, lease and last-room pointers. A guest voluntarily leaving a lobby that remains live is a different event. A bounded crash-recovery grace does not revive a deliberately closed lobby.
- Both session and persistent storage enforce expiry. Legacy unbounded pointers are invalid, not silently renewed. Expired associations are purged when browser execution resumes; no remote cleanup message is assumed to reach an offline client.
- Closure notification is bounded and best effort; admission safety cannot depend on receiving it. Preserve existing generation fences, same-lobby succession and credential checks. Do not retain permanent room-to-host tombstones.
- Random identity generation prevents deliberate reuse by this application; this does not claim that the public PeerJS service authenticates a lobby owner against a hostile third party claiming a known peer id. A separate authenticated signalling/capability protocol is a distinct unresolved security boundary, not a claim this storage repair can establish.

### Evidence required

`src/lobby-lifetime-storage.test.ts`: exact expiry boundaries in both stores, malformed/legacy data, blocked storage, scoped cleanup and other live-tab ownership.

`src/network-lobby-lifetime.test.ts`: fresh host ignores remembered id, deliberate close/create gets a new id, late callbacks cannot reactivate closed state, valid recovery and succession retain the live id, and failure cannot turn recovery into a new lobby.

`src/lobby-lifetime-main.test.ts`: execute the actual host/create/close integration boundary with synthetic dependencies; verify clearing order and stale-credential handling. A source-string check alone does not prove runtime lifecycle behavior.

Retain existing network connection-attempt, lifecycle, host recovery, migration and private-match checks. Boot the exact built candidate in a headless browser and exercise the lobby lifecycle. Preserve established netcode benchmarks; same-machine tests do not establish WAN behavior. Runtime/owner acceptance stays OPEN until actual receipts exist.

## Scheduling correction from Dave

VERIFIED owner clarification on 11 September: the multiplayer and chat feedback is notes for fixing later. The original overnight delivery repair remains the priority. HF-566 staged work is preserved but not installed; HF-567 through HF-569 are follow-up obligations. OPEN means owed, not accepted or scheduled into tonight.

### HF-567 — LOBBY-START-READY-001

| ID | Priority | Expected result | Owner | Falsifier | Scope | State |
| --- | --- | --- | --- | --- | --- | --- |
| HF-567 | P1 | Do not start the multiplayer game or match timer until every expected player is confirmed joined and ready. | delivery-integration-20260911 / Codex integrator | A delayed, loading, disconnected or unready expected player permits the game or timer to start. | Multiplayer, all maps; follow-up | OPEN |

Required future evidence: exercise the actual host/guest browser path and the planned test target `src/lobby-start-readiness.test.ts`. The target is an obligation, not an existing test or receipt.

### HF-568 — MULTIPLAYER-MOVEMENT-001

| ID | Priority | Expected result | Owner | Falsifier | Scope | State |
| --- | --- | --- | --- | --- | --- | --- |
| HF-568 | P2 | Investigate players unable to move until everyone joins and they have been killed; test later as Dave requested. | delivery-integration-20260911 / Codex integrator | A guest cannot move after admission, or death/respawn unexpectedly clears the lock. | Multiplayer, all maps; follow-up | OPEN |

Required future evidence: exercise the actual host/guest browser path and the planned test target `src/multiplayer-movement-admission.test.ts`. The target is an obligation, not an existing test or receipt.

### HF-569 — REMOVE-TEXT-CHAT-001

| ID | Priority | Expected result | Owner | Falsifier | Scope | State |
| --- | --- | --- | --- | --- | --- | --- |
| HF-569 | P2 | Remove text chat options from both the multiplayer lobby and in-game UI. | delivery-integration-20260911 / Codex integrator | Lobby or in-game chat controls, typing shortcuts or chat entry remain available. | Multiplayer, all maps; follow-up | OPEN |

Required future evidence: exercise the actual host/guest browser path and the planned test target `src/text-chat-removal.test.ts`. The target is an obligation, not an existing test or receipt.

HF-567 diagnosis is OPEN: the existing ready predicate already rejects pending guests, disconnected reservations and unready members; the start clock is assigned before asynchronous arena admission completes. A delayed-guest reproduction is still needed. HF-568 is owner-reported, not locally reproduced. HF-569 covers text chat, not voice or unrelated multiplayer controls.

## HF-570 — Inspectable current Nuke Town visual slice

VERIFIED direct owner scope amendment on12September: while away for2–3hours, continue the routing/rebase work and add a nice inspectable slice of the current Nuke Town map using the upgraded, integrated code-only visual method, targeting13:15UK if possible. This reopens bounded visual work; HF566–569 andWASM remain deferred.

| ID | Priority | Expected result | Owner | Falsifier | Scope | State |
| --- | --- | --- | --- | --- | --- | --- |
| HF-570 | P1 | A visibly improved, reusable code-only house/garage street-front slice runs inside the current Nuke Town game; one exact-source preview and before/after evidence make it inspectable. | delivery-integration-20260911 / Codex integrator | The slice exists only in a separate mock scene; an opening or authority changes; fixed-view pixels regress; budgets increase; a consumer or evidence pin is stale; the user cannot open the built candidate. | Nuke Town house/garage frontage, Performance and High; bounded13:15UK target | OPEN |

Planning requirement: `NUKETOWN-INSPECTABLE-SLICE-001` in the linked continuation register. Design, frozen baseline, scorecard, ownership and timeboxes: `docs/forge/NUKETOWN_INSPECTABLE_SLICE_2026-09-12.md`. Actual owner taste and release acceptance remain separate. Existing vehicle-budget and multiplayer-soak failures stay visible.
