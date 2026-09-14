// Self-contained so Playwright can serialize this function into the page.
// Freeze expected identity BEFORE calling reload. Host results are never inputs.
export function captureReloadTrigger() {
  const debug = window.__ATOMIC_ACRES_DEBUG__;
  const initial = debug.snapshot();
  const before = initial.player;
  const life = (snapshot) => ({
    subjectId: snapshot.player.id,
    epoch: snapshot.killstreak?.matchEpoch ?? null,
    hp: snapshot.player.hp, alive: snapshot.player.alive,
    lifeId: snapshot.networkSync?.localContinuity ?? null,
    connectionEpoch: snapshot.reloadAuthority?.localIdentity?.connectionEpoch ?? null,
    supportLife: snapshot.killstreak?.actors?.find(actor => actor.actorId === snapshot.player.id)?.lifeId ?? null,
    deathCount: snapshot.privateMatch?.scores?.find(score => score.id === snapshot.player.id)?.deaths ?? null,
  });
  const beforeLife = life(initial);
  const beforeRows = initial.reloadAuthority?.protocolTrace ?? [];
  const atMs = performance.now();
  debug.reload();
  const afterSnapshot = debug.snapshot();
  const after = afterSnapshot.player;
  // The trace has a fixed 128-row ring, so array length is NOT an append cursor.
  // A saturated ring keeps the same length after insertion. Correlate the new
  // local start by identity and timestamp instead; never search host results.
  const beforeKeys = new Set(beforeRows.map(row => `${row.actorId}|${row.requestId}|${row.actionSequence}|${row.direction}`));
  const starts = (afterSnapshot.reloadAuthority?.protocolTrace ?? []).filter(row => row.actorId === before.id
    && row.action === 'start' && row.direction === 'send' && row.status === 'requested'
    && row.reason === 'reliable-retry-lane' && row.atMs >= Math.floor(atMs)
    && !beforeKeys.has(`${row.actorId}|${row.requestId}|${row.actionSequence}|${row.direction}`));
  const initiated = starts.length === 1 ? starts[0] : null;
  return {
    subjectId: before.id, atMs, afterAtMs: performance.now(), origin: performance.timeOrigin,
    beforeAmmo: before.ammo, afterAmmo: after.ammo, reloading: after.reloading,
    beforeLife, afterLife: life(afterSnapshot),
    requestId: initiated?.requestId ?? null, actionSequence: initiated?.actionSequence ?? null,
    initiatedAtMs: initiated?.atMs ?? null, localStartCount: starts.length,
  };
}
