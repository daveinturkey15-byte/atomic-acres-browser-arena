export type ArenaZone = 'aqua-home' | 'coral-home' | 'west-garden' | 'central-transit' | 'east-service';

export function classifyArenaZone(x: number, z: number): ArenaZone {
  if (z < -25) return 'aqua-home';
  if (z > 25) return 'coral-home';
  if (x < -17) return 'west-garden';
  if (x > 17) return 'east-service';
  return 'central-transit';
}

export function arenaZoneLabel(zone: ArenaZone): string {
  if (zone === 'aqua-home') return 'AQUA HABITAT';
  if (zone === 'coral-home') return 'CORAL HABITAT';
  if (zone === 'west-garden') return 'VERDANT ARRAY';
  if (zone === 'east-service') return 'HELIO SERVICE';
  return 'CIVIC TRANSIT';
}

export function arenaAnimationAt(now: number): { landmarkYaw: number; beaconPulse: number; signGlow: number } {
  const seconds = Math.max(0, now) / 1000;
  return {
    landmarkYaw: seconds * 0.12,
    beaconPulse: 0.55 + 0.45 * Math.sin(seconds * Math.PI * 1.4),
    signGlow: 0.72 + 0.28 * Math.sin(seconds * 0.85),
  };
}
