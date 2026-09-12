/**
 * Domination (owner 2026-08-30, Test2 headline mode): three capture zones,
 * host-authoritative, pure state machine — no rendering, no network, no
 * timers. The caller advances it with the live presence list each host step
 * and replicates the returned state verbatim; guests render snapshots only.
 *
 * Rules (docs/TEST2_MAP_BRIEF.md): stand inside a 4.5 m zone with no live
 * enemy inside to capture; 5 s flips a neutral zone (10 s to flip one the
 * enemy owns — back through neutral first); contested freezes progress; each
 * held zone ticks +1 team point every 5 s; first to 200 wins, or the higher
 * score at the timer.
 */

export type DominationTeam = 0 | 1;
export type DominationZoneId = 'A' | 'B' | 'C';

export const DOMINATION_ZONE_RADIUS_M = 4.5;
export const DOMINATION_CAPTURE_MS = 5_000;
export const DOMINATION_TICK_MS = 5_000;
export const DOMINATION_TICK_POINTS = 1;
export const DOMINATION_WIN_SCORE = 200;
export const DOMINATION_TIME_LIMIT_MS = 10 * 60_000;

export type DominationZoneSeed = Readonly<{
  id: DominationZoneId;
  /** World centre of the zone disc (y is informational; presence is XZ). */
  centre: readonly [number, number, number];
  radius?: number;
}>;

export type DominationZone = {
  id: DominationZoneId;
  centre: readonly [number, number, number];
  radius: number;
  owner: DominationTeam | null;
  /** Team currently accumulating capture progress, if any. */
  capturingTeam: DominationTeam | null;
  /** 0..1 toward the capturing team's flip of the CURRENT ownership step. */
  progress: number;
  contested: boolean;
  nextTickAtMs: number | null;
};

export type DominationPresence = Readonly<{
  team: DominationTeam;
  alive: boolean;
  position: readonly [number, number, number];
}>;

export type DominationEvent =
  | Readonly<{ kind: 'neutralized'; zone: DominationZoneId; by: DominationTeam }>
  | Readonly<{ kind: 'captured'; zone: DominationZoneId; by: DominationTeam }>
  | Readonly<{ kind: 'tick'; zone: DominationZoneId; team: DominationTeam; points: number }>;

export type DominationState = {
  zones: DominationZone[];
  scores: [number, number];
  startedAtMs: number;
  lastAdvanceAtMs: number;
};

export function createDominationState(seeds: readonly DominationZoneSeed[], nowMs: number): DominationState {
  return {
    zones: seeds.map((seed) => ({
      id: seed.id,
      centre: seed.centre,
      radius: seed.radius ?? DOMINATION_ZONE_RADIUS_M,
      owner: null,
      capturingTeam: null,
      progress: 0,
      contested: false,
      nextTickAtMs: null,
    })),
    scores: [0, 0],
    startedAtMs: nowMs,
    lastAdvanceAtMs: nowMs,
  };
}

function insideZone(zone: DominationZone, presence: DominationPresence): boolean {
  const dx = presence.position[0] - zone.centre[0];
  const dz = presence.position[2] - zone.centre[2];
  return dx * dx + dz * dz <= zone.radius * zone.radius;
}

export function advanceDomination(
  state: DominationState,
  presences: readonly DominationPresence[],
  nowMs: number,
): readonly DominationEvent[] {
  const dtMs = Math.max(0, nowMs - state.lastAdvanceAtMs);
  state.lastAdvanceAtMs = nowMs;
  const events: DominationEvent[] = [];
  for (const zone of state.zones) {
    const occupants = presences.filter((presence) => presence.alive && insideZone(zone, presence));
    const teamInside: [boolean, boolean] = [
      occupants.some((presence) => presence.team === 0),
      occupants.some((presence) => presence.team === 1),
    ];
    zone.contested = teamInside[0] && teamInside[1];
    if (zone.contested) {
      // Progress and ticking freeze while both teams stand in the zone.
      continue;
    }
    const attacker: DominationTeam | null = teamInside[0] ? 0 : teamInside[1] ? 1 : null;
    if (attacker !== null && attacker !== zone.owner) {
      if (zone.capturingTeam !== attacker) {
        zone.capturingTeam = attacker;
        zone.progress = 0;
      }
      zone.progress = Math.min(1, zone.progress + dtMs / DOMINATION_CAPTURE_MS);
      if (zone.progress >= 1) {
        if (zone.owner !== null) {
          // Owned zones fall to neutral first; the next full bar captures.
          zone.owner = null;
          zone.nextTickAtMs = null;
          zone.progress = 0;
          events.push({ kind: 'neutralized', zone: zone.id, by: attacker });
        } else {
          zone.owner = attacker;
          zone.capturingTeam = null;
          zone.progress = 0;
          zone.nextTickAtMs = nowMs + DOMINATION_TICK_MS;
          events.push({ kind: 'captured', zone: zone.id, by: attacker });
        }
      }
    } else if (attacker === null && zone.capturingTeam !== null) {
      // Abandoned mid-capture: progress decays at the same rate it built.
      zone.progress = Math.max(0, zone.progress - dtMs / DOMINATION_CAPTURE_MS);
      if (zone.progress === 0) zone.capturingTeam = null;
    }
    if (zone.owner !== null && zone.nextTickAtMs !== null) {
      while (nowMs >= zone.nextTickAtMs) {
        state.scores[zone.owner] += DOMINATION_TICK_POINTS;
        events.push({ kind: 'tick', zone: zone.id, team: zone.owner, points: DOMINATION_TICK_POINTS });
        zone.nextTickAtMs += DOMINATION_TICK_MS;
      }
    }
  }
  return events;
}

export function dominationWinner(state: DominationState, nowMs: number): DominationTeam | 'draw' | null {
  const [teamA, teamB] = state.scores;
  if (teamA >= DOMINATION_WIN_SCORE || teamB >= DOMINATION_WIN_SCORE) return teamA === teamB ? 'draw' : teamA > teamB ? 0 : 1;
  if (nowMs - state.startedAtMs >= DOMINATION_TIME_LIMIT_MS) return teamA === teamB ? 'draw' : teamA > teamB ? 0 : 1;
  return null;
}

/** Bots head for the nearest zone their team does not own (defend when all owned). */
export function dominationObjectiveFor(
  state: DominationState,
  team: DominationTeam,
  position: readonly [number, number, number],
): DominationZone | null {
  const wanted = state.zones.filter((zone) => zone.owner !== team);
  const pool = wanted.length > 0 ? wanted : state.zones;
  let best: DominationZone | null = null;
  let bestDistance = Infinity;
  for (const zone of pool) {
    const dx = position[0] - zone.centre[0];
    const dz = position[2] - zone.centre[2];
    const distance = dx * dx + dz * dz;
    if (distance < bestDistance) {
      bestDistance = distance;
      best = zone;
    }
  }
  return best;
}
