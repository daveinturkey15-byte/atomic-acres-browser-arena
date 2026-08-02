/**
 * Evicts only the exact failed construction generation. A stale failure must
 * never delete a newer candidate that has already claimed the same arena key.
 */
export function evictExactFailedArenaGeneration<Key, Candidate>(
  cache: Map<Key, Candidate>,
  key: Key,
  failedCandidate: Candidate,
  retire: (candidate: Candidate) => void,
): boolean {
  if (cache.get(key) !== failedCandidate) return false;
  cache.delete(key);
  retire(failedCandidate);
  return true;
}
