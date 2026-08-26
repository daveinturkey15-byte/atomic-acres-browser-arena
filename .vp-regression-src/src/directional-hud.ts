export type PlanarPoint = { x: number; z: number };

/**
 * CSS rotation for a source around the player: 0 is forward/top, positive is
 * camera-right/clockwise, and negative is camera-left/counter-clockwise.
 */
export function sourceScreenAngle(player: PlanarPoint, playerYaw: number, source: PlanarPoint): number {
  const dx = source.x - player.x;
  const dz = source.z - player.z;
  if (!Number.isFinite(dx) || !Number.isFinite(dz) || !Number.isFinite(playerYaw) || dx * dx + dz * dz < 1e-12) return 0;
  const forwardX = -Math.sin(playerYaw);
  const forwardZ = -Math.cos(playerYaw);
  const rightX = Math.cos(playerYaw);
  const rightZ = -Math.sin(playerYaw);
  const forward = dx * forwardX + dz * forwardZ;
  const right = dx * rightX + dz * rightZ;
  return Math.atan2(right, forward);
}