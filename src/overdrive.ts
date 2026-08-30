// HF-385 (owner, 2026-08-28): "the 2x damage needs adjusting". Retuned 120 s/30 s ->
// 90 s/20 s: the core contests half again as often and a holder's reign is a third
// shorter, so losing the flip costs a squad 20 seconds of double-damage exposure
// rather than 30. The multiplier itself stays 2 - the owner asked for adjustment,
// not removal, and 2x is the identity of the pickup.
export const OVERDRIVE_SPAWN_INTERVAL_MS = 90_000;
export const OVERDRIVE_DURATION_MS = 20_000;
export const OVERDRIVE_DAMAGE_MULTIPLIER = 2;
export const OVERDRIVE_PICKUP_RADIUS = 1.65;
/**
 * Nuke Town is the only arena that runs the core (src/map-selection.ts:49), so
 * this constant IS that arena's tuning. HF-385: (0, 0.82, 0) was sealed inside
 * CENTRAL_BUS - a solid 12.6 x 3.8 x 5.6 m collider centred on the origin
 * since the Pass 78 rebuild (src/arena-layout.ts CENTRAL_BUS, built solid at
 * src/map.ts) - leaving the nearest standable point 3.25 m away against a
 * 1.65 m pickup radius and the 2x icon depth-occluded inside the bus body.
 * The core now sits on the street centre line 3.3 m past the bus's east end,
 * so it is claimable and its icon renders in the open.
 *
 * CORRECTED Pass 81. This block used to claim the seat was ">= 2.7 m clear of
 * every layout solid (bus face, both planter fins, the east van, bins and
 * benches) at street level". That was true when written and is false now.
 * Clearances from (9.6, 0) to each layout solid, computed from
 * src/arena-layout.ts at HEAD: east parked van 0.55 m, central bus 3.30 m,
 * nearest planter fin 3.89 m. HF-383a restaged both vans off the kerb and into
 * the middle of the street - east-parked-van moved from (16, 0) to
 * (8.6, -1.5) - which brought the van's near face to within 0.55 m of the core
 * without anyone revisiting this comment.
 *
 * The seat itself is still sound: src/nuketown-overdrive-core.test.ts checks
 * the two properties that actually matter - that a standable point exists well
 * inside OVERDRIVE_PICKUP_RADIUS, and that neither the core nor its world icon
 * sits inside a solid - and both still hold at 0.55 m, because the van sits
 * beside the seat rather than over it. So only the prose rotted.
 *
 * But note the second false claim it made: "if the map moves again, the guard
 * fails instead of rotting like the origin seat did". The map DID move and the
 * guard did NOT fail, because no gate ever asserted a blanket 2.7 m clearance.
 * Do not read a clearance contract into this constant that no test enforces.
 * Tuning is deliberately untouched pending the owner's answer on HF-385.
 *
 * TRADE: an off-origin seat breaks the layout's exact 180-degree rotational
 * symmetry. Accepted because team spawns split north/south across the full
 * street length (SPAWN_LAYOUT), so an east/west offset is near-equidistant
 * for both teams in practice; hollowing the bus to keep the centre seat was
 * rejected as a structural rewrite of the map's hard cover anchor mid-pass.
 */
// Owner 2026-08-30 ("2x damage needs a better spawn spot, top of bus"):
// the core hovers over the v6 main roof (top 3.0). Pickup is Y-gated so the
// aisle below cannot collect it through the roof slab.
export const OVERDRIVE_POSITION = Object.freeze({ x: 0, y: 3.75, z: 0 });
export const OVERDRIVE_PICKUP_HEIGHT_WINDOW_M = 1.9;

export type OverdriveState = Readonly<{
  generation: number;
  available: boolean;
  nextSpawnAt: number;
  holderId: string | null;
  activeUntil: number;
  position: Readonly<{ x: number; y: number; z: number }>;
}>;

export function createOverdriveState(matchStartedAt: number): OverdriveState {
  const startedAt = Number.isFinite(matchStartedAt) ? matchStartedAt : 0;
  return {
    generation: 0,
    available: false,
    nextSpawnAt: startedAt + OVERDRIVE_SPAWN_INTERVAL_MS,
    holderId: null,
    activeUntil: 0,
    position: OVERDRIVE_POSITION,
  };
}

export function advanceOverdrive(state: OverdriveState, now: number): OverdriveState {
  const safeNow = Number.isFinite(now) ? now : 0;
  const active = state.holderId !== null && safeNow < state.activeUntil;
  if (active) return state;
  const dropped = state.available && state.holderId === null && state.activeUntil > 0;
  if (dropped && safeNow < state.activeUntil) return state;
  if (dropped) {
    return { ...state, available: false, holderId: null, activeUntil: 0, position: OVERDRIVE_POSITION };
  }
  if (!state.available && safeNow >= state.nextSpawnAt) {
    return { ...state, available: true, holderId: null, activeUntil: 0, position: OVERDRIVE_POSITION };
  }
  if (state.holderId !== null || state.activeUntil !== 0) {
    return { ...state, holderId: null, activeUntil: 0, position: OVERDRIVE_POSITION };
  }
  return state;
}

export function claimOverdrive(
  state: OverdriveState,
  playerId: string,
  position: Readonly<{ x: number; y: number; z: number }>,
  alive: boolean,
  now: number,
): { state: OverdriveState; claimed: boolean } {
  const advanced = advanceOverdrive(state, now);
  if (!advanced.available || !alive || !playerId || !Number.isFinite(position.x) || !Number.isFinite(position.y) || !Number.isFinite(position.z)) {
    return { state: advanced, claimed: false };
  }
  const distance = Math.hypot(position.x - advanced.position.x, position.z - advanced.position.z);
  // v6: the height window tightens from 2.4 so the aisle below the bus roof
  // cannot claim the core through the slab (roof eye dy 0.95, aisle dy 2.05).
  if (distance > OVERDRIVE_PICKUP_RADIUS || Math.abs(position.y - advanced.position.y) > OVERDRIVE_PICKUP_HEIGHT_WINDOW_M) {
    return { state: advanced, claimed: false };
  }
  const safeNow = Number.isFinite(now) ? now : 0;
  const continuingDroppedCore = advanced.activeUntil > safeNow;
  return {
    claimed: true,
    state: {
      generation: advanced.generation + 1,
      available: false,
      nextSpawnAt: continuingDroppedCore ? advanced.nextSpawnAt : safeNow + OVERDRIVE_SPAWN_INTERVAL_MS,
      holderId: playerId,
      activeUntil: continuingDroppedCore ? advanced.activeUntil : safeNow + OVERDRIVE_DURATION_MS,
      position: advanced.position,
    },
  };
}

export function overdriveDamageMultiplier(state: OverdriveState, playerId: string, now: number): number {
  return state.holderId === playerId && Number.isFinite(now) && now < state.activeUntil
    ? OVERDRIVE_DAMAGE_MULTIPLIER
    : 1;
}

export function overdriveRemainingMs(state: OverdriveState, playerId: string, now: number): number {
  return state.holderId === playerId ? Math.max(0, Math.ceil(state.activeUntil - now)) : 0;
}

export function dropOverdriveOnElimination(
  state: OverdriveState,
  victimId: string,
  position: Readonly<{ x: number; y: number; z: number }>,
  now: number,
): { state: OverdriveState; dropped: boolean } {
  if (state.holderId !== victimId || !Number.isFinite(now) || now >= state.activeUntil
    || !Number.isFinite(position.x) || !Number.isFinite(position.y) || !Number.isFinite(position.z)) {
    return { state, dropped: false };
  }
  return {
    dropped: true,
    state: {
      ...state,
      generation: state.generation + 1,
      available: true,
      holderId: null,
      position: { x: position.x, y: position.y, z: position.z },
    },
  };
}
