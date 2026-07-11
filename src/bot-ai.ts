export type BotMovement = 'idle' | 'advance' | 'retreat' | 'strafe-left' | 'strafe-right';

export type BotSense = {
  alive: boolean;
  distanceToPlayer: number;
  hasLineOfSight: boolean;
  health: number;
  now: number;
  lastShotAt: number;
  waypointReached: boolean;
  random: number;
};

export type BotIntent = {
  movement: BotMovement;
  fire: boolean;
  changeWaypoint: boolean;
};

export function chooseBotIntent(sense: BotSense): BotIntent {
  if (!sense.alive) return { movement: 'idle', fire: false, changeWaypoint: false };
  const fire = sense.hasLineOfSight
    && sense.distanceToPlayer <= 55
    && sense.distanceToPlayer >= 2.5
    && sense.now - sense.lastShotAt >= 520;
  let movement: BotMovement;
  if (sense.distanceToPlayer < 5.5) movement = 'retreat';
  else if (!sense.hasLineOfSight || sense.distanceToPlayer > 28) movement = 'advance';
  else movement = sense.random < 0.5 ? 'strafe-right' : 'strafe-left';
  return { movement, fire, changeWaypoint: sense.waypointReached || (!sense.hasLineOfSight && sense.random > 0.88) };
}

export function respawnBotState(now: number): {
  health: number;
  alive: boolean;
  invulnerableUntil: number;
  lastShotAt: number;
} {
  return { health: 100, alive: true, invulnerableUntil: now + 1_000, lastShotAt: 0 };
}
