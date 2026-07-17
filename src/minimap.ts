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

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
}

export function minimapToWorld(
  x: number,
  y: number,
  bounds: MinimapBounds,
  width: number,
  height: number,
): { x: number; z: number } {
  const normalizedX = clamp01(x / Math.max(1, width));
  const normalizedY = clamp01(y / Math.max(1, height));
  return {
    x: bounds.minX + normalizedX * (bounds.maxX - bounds.minX),
    z: bounds.maxZ - normalizedY * (bounds.maxZ - bounds.minZ),
  };
}

export type FacingGeometry = {
  nose: [number, number];
  tail: [number, number];
  left: [number, number];
  right: [number, number];
  coneLeft: [number, number];
  coneRight: [number, number];
};

export function playerFacingGeometry(x: number, y: number, yaw: number, length = 22, width = 9): FacingGeometry {
  const forwardX = -Math.sin(yaw);
  const forwardY = Math.cos(yaw);
  const rightX = -forwardY;
  const rightY = forwardX;
  return {
    nose: [x + forwardX * length, y + forwardY * length],
    tail: [x - forwardX * length * 0.55, y - forwardY * length * 0.55],
    left: [x - forwardX * 3 - rightX * width, y - forwardY * 3 - rightY * width],
    right: [x - forwardX * 3 + rightX * width, y - forwardY * 3 + rightY * width],
    coneLeft: [x + forwardX * 38 - rightX * 18, y + forwardY * 38 - rightY * 18],
    coneRight: [x + forwardX * 38 + rightX * 18, y + forwardY * 38 + rightY * 18],
  };
}

export function headingDegrees(yaw: number): number {
  return Math.round(((((180 + (yaw * 180) / Math.PI) % 360) + 360) % 360));
}

/** Canvas rotation that keeps the player's camera-forward direction at the top of a player-centred minimap. */
export function playerUpRotationRadians(yaw: number): number {
  const heading = ((Math.PI + yaw) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);
  return -heading;
}

export function northMarkerPosition(yaw: number, width: number, height: number, inset = 24): [number, number] {
  const radius = Math.max(0, Math.min(width, height) / 2 - Math.max(0, inset));
  const angle = -Math.PI / 2 + playerUpRotationRadians(yaw);
  return [width / 2 + Math.cos(angle) * radius, height / 2 + Math.sin(angle) * radius];
}
