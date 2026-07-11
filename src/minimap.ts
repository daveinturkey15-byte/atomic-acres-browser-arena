export type MinimapBounds = { minX: number; maxX: number; minZ: number; maxZ: number };

export function worldToMinimap(
  x: number,
  z: number,
  bounds: MinimapBounds,
  width: number,
  height: number,
): [number, number] {
  const normalizedX = Math.max(0, Math.min(1, (x - bounds.minX) / Math.max(0.001, bounds.maxX - bounds.minX)));
  const normalizedZ = Math.max(0, Math.min(1, (z - bounds.minZ) / Math.max(0.001, bounds.maxZ - bounds.minZ)));
  return [normalizedX * width, height - normalizedZ * height];
}

export function shouldRevealEnemy(distance: number, now: number, lastShotAt: number): boolean {
  return distance <= 15 || (lastShotAt > 0 && now - lastShotAt <= 3_000);
}
