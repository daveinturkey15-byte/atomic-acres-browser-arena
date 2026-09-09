# Astra relay ordering fix — stale remote reload-result rejection

## Premise (confirmed)

`acceptRemoteReloadResult` (`src/legacy-main.ts:6535-6544`) applied the host
reload projection via `applyRemoteReloadResult`, then unconditionally wrote
`remoteCombatInventoryRevisions.set(id, message.combatInventory.revision)`.
The state lane (`src/legacy-main.ts:13629-13631`) goes through
`applyRemoteInventoryProjectionToMaps` (`src/multiplayer-relay.ts:24-33`),
which rejects `projection.revision < stored`. The reload-result lane had no
equivalent guard, so a newer host-authored state projection (e.g. stored
revision 8) arriving before an older reliable reload result (revision 7)
rolled back counters and reloading/held-weapon presentation.

## Observed

- `sendRemoteReloadResult` broadcasts on the reliable lane via `network.send(result)`
  (`src/legacy-main.ts:6362`); state projections travel the snapshot lane and are
  admitted at `src/legacy-main.ts:13628-13631`. Cross-channel reorder is possible
  per `browser-multiplayer-netcode` core architecture (unreliable movement vs
  reliable events).
- State lane guards staleness (`multiplayer-relay.ts:29`); reload-result lane did
  not (former `legacy-main.ts:6539-6542`).
- `legacy-main.ts` remains exactly 37396 lines after this change (same-line call
  argument, no added lines).
- `npx vitest run src/multiplayer-relay.test.ts` could not execute here: missing
  `vitest/config` (dependencies not installed; install out of scope for this lane).

## Inferred

- Stored revision 8 + reload-result revision 7 previously rolled back inventory and
  presentation; now rejected before mutation (`return null`, caller leaves
  `remote.snapshot` and both maps untouched).

## Assumed

- Host emits monotonically increasing `combatInventory.revision` on both lanes.

## Unknown

- Real multi-household NAT/TURN reorder rates (not measured in this lane).

## Falsifier

- A trace showing a stale (`revision < stored`) reload result being applied after
  this change would disprove the fix.

## Fix (exact)

- `src/multiplayer-relay.ts`: `applyRemoteReloadResult` takes `currentRevision = -1`
  and returns `null` when `message.combatInventory.revision < currentRevision`.
  Same-revision (`==`) started/committed still accepted; newer (`>`) accepted.
- `src/legacy-main.ts:6539` (same line): passes
  `remoteCombatInventoryRevisions.get(id) ?? -1`. Existing life/host guards and the
  unconditional write on the accepted path are unchanged.
- `src/multiplayer-relay.test.ts`: new `remote reload stale-revision guard` block —
  stale rejection (maps/snapshot untouched), same-revision started/committed
  acceptance, newer acceptance. No existing cases deleted or weakened.

## Remaining checks (OPEN)

- `npx vitest run src/multiplayer-relay.test.ts` (needs dependencies).
- Live browser proof: OPEN (no browsers in this lane).
- Downstream: full pipeline preflight + bounded-browser checks at integration.
