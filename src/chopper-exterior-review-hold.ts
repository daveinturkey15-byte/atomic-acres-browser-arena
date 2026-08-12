export type ChopperExteriorReviewHoldContext = Readonly<{
  arenaId: string;
  gameMode: string;
  networkRole: string;
  gameStarted: boolean;
  matchPhase: string;
  menuSurface: string;
}>;

export function chopperExteriorReviewHoldActive(
  requested: boolean,
  context: ChopperExteriorReviewHoldContext,
): boolean {
  return requested
    && context.arenaId === 'gun-range'
    && context.gameMode === 'solo'
    && context.networkRole === 'offline'
    && context.gameStarted
    && context.matchPhase === 'active'
    && context.menuSurface === 'hidden';
}
