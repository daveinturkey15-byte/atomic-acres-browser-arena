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
  lineOfSightSince?: number;
  reactionDelay?: number;
  burstShotsRemaining?: number;
};

export type BotIntent = {
  movement: BotMovement;
  fire: boolean;
  changeWaypoint: boolean;
};

export function chooseBotIntent(sense: BotSense): BotIntent {
  if (!sense.alive) return { movement: 'idle', fire: false, changeWaypoint: false };
  const reacted = sense.hasLineOfSight
    && sense.now - (sense.lineOfSightSince ?? sense.now) >= (sense.reactionDelay ?? 0);
  const shotInterval = (sense.burstShotsRemaining ?? 0) > 0 ? 135 : 620;
  const fire = reacted
    && sense.distanceToPlayer <= 55
    && sense.distanceToPlayer >= 2.5
    && sense.now - sense.lastShotAt >= shotInterval;
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
