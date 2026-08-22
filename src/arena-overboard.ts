export type ArenaWaterContact = Readonly<{ inWater: boolean }>;

/**
 * High Seas has no swimming route: reaching the surrounding ocean is an
 * overboard elimination. Other arenas retain their authored water behaviour.
 */
export function shouldEliminateArenaOverboard(
  arenaId: string,
  water: ArenaWaterContact,
): boolean {
  return arenaId === 'high-seas' && water.inWater;
}
