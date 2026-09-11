// Invoked in the host page after the observer's full-projection parity check.
// Actual reads bracket the synchronous damage call; timestamps are not inferred.
export function captureCausalDeathTrigger(id) {
  const debug = window.__ATOMIC_ACRES_DEBUG__;
  if (typeof debug?.sampleCausalLifeSubject !== 'function') throw Error('causal trigger read unavailable');
  const read = () => {
    const readStart = performance.now();
    const value = debug.sampleCausalLifeSubject(id);
    const readEnd = performance.now();
    return { ...value, readStart, readEnd, origin: performance.timeOrigin };
  };
  const before = read();
  const atMs = performance.now();
  const applied = debug.damageRemoteAuthoritatively(500, id);
  const after = read();
  return { before, after, applied, atMs, afterAtMs: performance.now(), origin: performance.timeOrigin };
}
