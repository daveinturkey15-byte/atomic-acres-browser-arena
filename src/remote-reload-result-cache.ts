import type { ReloadResultMessage } from './protocol';

export function createRemoteReloadResultCache(maxPerPlayer = 8) {
  const entries = new Map<string, ReloadResultMessage>();
  return {
    get(key: string): ReloadResultMessage | undefined {
      return entries.get(key);
    },
    set(key: string, result: ReloadResultMessage): void {
      for (const [cachedKey, cached] of entries) {
        if (cached.forPlayerId === result.forPlayerId && cached.lifeId !== result.lifeId) entries.delete(cachedKey);
      }
      entries.set(key, result);
      const playerKeys = [...entries]
        .filter(([, cached]) => cached.forPlayerId === result.forPlayerId)
        .map(([cachedKey]) => cachedKey);
      for (const oldKey of playerKeys.slice(0, -maxPerPlayer)) entries.delete(oldKey);
    },
    clear(): void {
      entries.clear();
    },
    clearPlayer(playerId: string): void {
      for (const [key, result] of entries) if (result.forPlayerId === playerId) entries.delete(key);
    },
    get size(): number {
      return entries.size;
    },
  };
}
