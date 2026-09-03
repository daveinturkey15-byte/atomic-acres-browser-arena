import { NUKETOWN2_CENTRAL_TRUCK } from './nuketown2-layout';

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
//
// THIS IS NOW THE DEFAULT, NOT THE ONLY VALUE - HF-432 item 5, and the
// orchestrator authorised the change. The Nuke Town Rebuild's moving truck
// stands where the reference has it, 0.076 of the street length SOUTH of the
// road centre-line, and until this pass the core could not follow it: the
// constant below was a single global, so the rebuild had to park its truck on
// the world origin instead and record the difference as a knowingly-taken
// deviation (docs/nuketown-rebuild/REFERENCE_SCHEMATIC.md 5.5). The SHIPPED
// Nuke Town's seat is unchanged, byte for byte, and its own gates
// (src/nuketown-overdrive-core.test.ts, src/overdrive-line-of-sight.test.ts)
// read this constant exactly as before.
export const OVERDRIVE_POSITION = Object.freeze({ x: 0, y: 3.75, z: 0 });

/**
 * Per-arena core seats. DERIVED from the arena's own authored geometry rather
 * than transcribed: `src/railgun-authority.ts`' header records what happened
 * the last time a pickup coordinate was hand-written against a layout that
 * later moved (half of all matches put the weapon outside the map), and
 * `src/nuketown2-layout.ts` exists precisely so a weapons module can read a
 * layout constant without closing a require cycle through `protocol.ts`.
 */
export const OVERDRIVE_ARENA_POSITIONS: Readonly<Record<string, Readonly<{ x: number; y: number; z: number }>>> = Object.freeze({
  nuketown2: Object.freeze({
    x: 0,
    y: NUKETOWN2_CENTRAL_TRUCK.roofY + NUKETOWN2_CENTRAL_TRUCK.coreHeightOverRoof,
    z: NUKETOWN2_CENTRAL_TRUCK.z,
  }),
});

/** The core's home seat on an arena. Every arena but the rebuild keeps the global. */
export function overdrivePositionForArena(arenaId: string): Readonly<{ x: number; y: number; z: number }> {
  return OVERDRIVE_ARENA_POSITIONS[arenaId] ?? OVERDRIVE_POSITION;
}
export const OVERDRIVE_PICKUP_HEIGHT_WINDOW_M = 1.9;

/**
 * PASS 87 Lane AR, item 5. Why the height window above is not enough on its own.
 *
 * The window is a SCALAR: it compares |eyeY - coreY| and knows nothing about
 * what is between them. On both Nuke Towns the core hovers over the bus roof,
 * and the arena is authored so the two heights land either side of 1.9 m - by
 * 1.10 m for a player on the roof and 2.00 m for a player standing in the
 * aisle, i.e. a margin of 0.10 m (src/nuketown2-arena.ts states this
 * explicitly). 0.10 m is less than a jump. A player who jumps in the aisle
 * raises their eye through the boundary and takes the core THROUGH THE ROOF
 * SLAB, from inside cover, without ever being contestable - which is the one
 * thing this pickup exists to force.
 *
 * The durable rule is the one every other pickup in this codebase already uses:
 * the claimant's eye must SEE the thing it claims. That is geometry, not
 * arithmetic, so it cannot be defeated by a stance, a jump, a new roof height
 * or a new arena. The window stays as well - it is cheap, it is a genuine
 * constraint, and nothing here weakens it.
 */
export type OverdriveClaimSight = Readonly<{
  /**
   * False when a movement/shot-blocking solid stands between the claimant's eye
   * and the core. Computed by the caller against the live arena colliders,
   * because this module is deliberately free of world state.
   */
  lineOfSightClear: boolean;
}>;

export type OverdriveState = Readonly<{
  generation: number;
  available: boolean;
  nextSpawnAt: number;
  holderId: string | null;
  activeUntil: number;
  position: Readonly<{ x: number; y: number; z: number }>;
  /**
   * The seat the core returns to. `position` moves when a holder is eliminated
   * (`dropOverdriveOnElimination`), and before HF-432 the way back was the
   * global constant - which is exactly the thing that stopped the core being
   * per-arena. It is carried on the state instead, so an arena's seat survives
   * a drop, a respawn and a host handover without any module having to know
   * which arena is loaded.
   */
  home: Readonly<{ x: number; y: number; z: number }>;
}>;

export function createOverdriveState(
  matchStartedAt: number,
  home: Readonly<{ x: number; y: number; z: number }> = OVERDRIVE_POSITION,
): OverdriveState {
  const startedAt = Number.isFinite(matchStartedAt) ? matchStartedAt : 0;
  return {
    generation: 0,
    available: false,
    nextSpawnAt: startedAt + OVERDRIVE_SPAWN_INTERVAL_MS,
    holderId: null,
    activeUntil: 0,
    position: home,
    home,
  };
}

export function advanceOverdrive(state: OverdriveState, now: number): OverdriveState {
  const safeNow = Number.isFinite(now) ? now : 0;
  const active = state.holderId !== null && safeNow < state.activeUntil;
  if (active) return state;
  const dropped = state.available && state.holderId === null && state.activeUntil > 0;
  if (dropped && safeNow < state.activeUntil) return state;
  if (dropped) {
    return { ...state, available: false, holderId: null, activeUntil: 0, position: state.home };
  }
  if (!state.available && safeNow >= state.nextSpawnAt) {
    return { ...state, available: true, holderId: null, activeUntil: 0, position: state.home };
  }
  if (state.holderId !== null || state.activeUntil !== 0) {
    return { ...state, holderId: null, activeUntil: 0, position: state.home };
  }
  return state;
}

export function claimOverdrive(
  state: OverdriveState,
  playerId: string,
  position: Readonly<{ x: number; y: number; z: number }>,
  alive: boolean,
  now: number,
  sight?: OverdriveClaimSight,
): { state: OverdriveState; claimed: boolean } {
  const advanced = advanceOverdrive(state, now);
  if (!advanced.available || !alive || !playerId || !Number.isFinite(position.x) || !Number.isFinite(position.y) || !Number.isFinite(position.z)) {
    return { state: advanced, claimed: false };
  }
  // A blocked eye ends the claim before anything else is considered. `sight`
  // is optional so that callers with no world to trace against (pure state
  // tests, the offline replay) keep the previous behaviour; the two shipped
  // call sites in src/legacy-main.ts always pass a computed value, which
  // src/overdrive-line-of-sight.test.ts asserts against the source.
  if (sight && !sight.lineOfSightClear) return { state: advanced, claimed: false };
  const distance = Math.hypot(position.x - advanced.position.x, position.z - advanced.position.z);
  // v6: the height window tightens from 2.4 so the aisle below the bus roof
  // cannot claim the core through the slab (roof eye dy 0.95, aisle dy 2.05).
  // Retained, and no longer load-bearing on its own - see OverdriveClaimSight.
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
      home: advanced.home,
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
