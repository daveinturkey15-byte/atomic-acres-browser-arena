/**
 * Source 50's sweep, kept in a module with NO imports of its own.
 *
 * That is deliberate: `scripts/technique-lab/group-c/passability-sweep.mjs`
 * runs under plain Node, which strips TypeScript types but resolves ESM
 * specifiers literally and therefore cannot follow this repository's
 * extensionless import style. Isolating the sweep here lets the gate import the
 * very same function the exhibit uses, so the two cannot drift apart.
 */

export type Obstacle = { x: number; z: number; radius: number };

export type Station = {
  z: number;
  /** Widest clear gap at this station, metres. */
  clearance: number;
  passable: boolean;
};

export type SweepResult = {
  stations: Station[];
  blockedRuns: Array<{ fromZ: number; toZ: number; stations: number }>;
  blocked: number;
  passableFraction: number;
};

export const PLAYER_RADIUS = 0.34;
export const STATION_SPACING = 1.5;

/**
 * Step the centreline every `spacing` metres; at each station sample across the
 * full paved width and find the widest continuous gap; a station passes when a
 * disc of `radius` fits. Runs of blocked stations are collapsed so a report
 * names regions rather than a wall of rows.
 */
export function sweepCorridor(
  length: number,
  width: number,
  obstacles: readonly Obstacle[],
  radius: number = PLAYER_RADIUS,
  spacing: number = STATION_SPACING,
): SweepResult {
  const stations: Station[] = [];
  const samples = 41;
  for (let z = -length / 2; z <= length / 2 + 1e-6; z += spacing) {
    let best = 0;
    let run = 0;
    for (let sample = 0; sample < samples; sample += 1) {
      const x = -width / 2 + (width * sample) / (samples - 1);
      const blocked = obstacles.some(
        (obstacle) => Math.hypot(x - obstacle.x, z - obstacle.z) < obstacle.radius,
      );
      run = blocked ? 0 : run + 1;
      best = Math.max(best, run);
    }
    const clearance = (best / samples) * width;
    stations.push({ z, clearance, passable: clearance >= radius * 2 });
  }

  const blockedRuns: SweepResult['blockedRuns'] = [];
  let current: { fromZ: number; toZ: number; stations: number } | null = null;
  for (const station of stations) {
    if (!station.passable) {
      if (current) {
        current.toZ = station.z;
        current.stations += 1;
      } else {
        current = { fromZ: station.z, toZ: station.z, stations: 1 };
      }
    } else if (current) {
      blockedRuns.push(current);
      current = null;
    }
  }
  if (current) blockedRuns.push(current);

  const blocked = stations.filter((station) => !station.passable).length;
  return {
    stations,
    blockedRuns,
    blocked,
    passableFraction: (stations.length - blocked) / stations.length,
  };
}

export const DEFECTIVE_OBSTACLES: readonly Obstacle[] = [
  { x: -0.4, z: -1.6, radius: 0.42 },
  // The defect: a crate pair that together leaves no 0.68 m gap anywhere.
  { x: -0.62, z: 1.4, radius: 0.72 },
  { x: 0.72, z: 1.4, radius: 0.66 },
];

export const CLEARED_OBSTACLES: readonly Obstacle[] = [
  { x: -0.4, z: -1.6, radius: 0.42 },
  { x: -0.82, z: 1.4, radius: 0.5 },
];
