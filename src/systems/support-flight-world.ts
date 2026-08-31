/**
 * The SUPPORT-FLIGHT half of the killstreak world: the arena-derived airspace
 * every aerial support flies inside, and the ground surface every placement
 * lands on.
 *
 * HF-131 (P0, still OPEN in the Pass 65 correction ledger) records the owner's
 * ask verbatim - "ensure the pilolted drone and drone swarm always spawn in the
 * center of the map in a spread out pattern" - and HF-143/HF-175 hang off the
 * same numbers (centre volume, separation, terrain-relative patrol floor). The
 * gun-range portal carries its own scar in `killstreak-flight-navigation.ts`:
 * the flight portal had to be pushed onto the test-bay interior because support
 * aircraft were spawning at the map centre OUTSIDE the room they belong in.
 *
 * All of that arithmetic lived inline in `killstreakWorldState()` in the
 * 33k-line legacy-main, where the only way to observe it was to activate a
 * killstreak in a browser. So the drone-deployment suite tested it by
 * HAND-COPYING the centre-portal sort, the centre-spawn formula, the half
 * extents and the flight predicates into the test file - a second copy of the
 * production premise, which is exactly the arrangement that lets the shipped
 * one drift silently. This module is the one home; the tests call it.
 *
 * It takes its whole world as parameters (arena id, arena bounds, a snapshot of
 * the current solids, and a raycast-mesh provider), returns a value, imports
 * nothing from legacy-main, holds no ambient state, and needs no DOM and no
 * renderer. legacy-main keeps a thin call site that adds the target roster, the
 * hostility predicate and line of sight.
 *
 * Behaviour is unchanged from legacy-main - this is a move, not a rewrite. The
 * one divergence it INHERITS rather than fixes is flagged at its site below.
 */
import { pointInsideBounds, sphereIntersectsBox, type Box2 } from '../collision';
import { GUN_RANGE_TEST_BAY_CONTRACT } from '../gun-range-test-bay';
import {
  PASS65_FLIGHT_NAVIGATION,
  resolveSupportFlightStep,
  type ArenaFlightNavigationDefinition,
  type FlightPortalHint,
} from '../killstreak-flight-navigation';
import type { KillstreakWorld } from '../killstreak-runtime';
import type { ArenaId } from '../map-selection';
import { resolveSupportAircraftEnvelopeStep } from '../support-aircraft-collision';
import {
  SupportPlacementGroundSampler,
  type SupportPlacementGroundSamplerOptions,
} from '../support-placement-ground';

/** Sphere radius the flight-validity probe uses for bounds and solid clearance. */
const FLIGHT_POSITION_CLEARANCE_M = 0.35;
/** Centre-volume extents, as a fraction of the arena span and of the ceiling. */
const CENTRE_VOLUME_HORIZONTAL_FRACTION = 0.12;
const CENTRE_VOLUME_HORIZONTAL_LIMIT_M = 7.5;
const CENTRE_VOLUME_VERTICAL_FRACTION = 0.05;
const CENTRE_VOLUME_VERTICAL_LIMIT_M = 2;
/** Spawn altitude for an arena that authors no portals at all (test1). */
const PORTALLESS_CENTRE_ALTITUDE_FRACTION = 0.45;

/**
 * Everything the airspace is derived from. `solids` is a SNAPSHOT taken once by
 * the caller: centre-spawn admission can run hundreds of bounded probes, and
 * re-enumerating the live collider set per probe introduced an activation
 * hitch. Every predicate below closes over that one array on purpose.
 */
export type SupportFlightWorldInput = Readonly<{
  arenaId: ArenaId;
  /** The arena's own horizontal bounds. Also the ground sampler's Y range. */
  bounds: Box2;
  /** Static + dynamic movement solids, snapshotted for this world. */
  solids: readonly Box2[];
  /** Deferred scene walk; only invoked if something actually samples ground. */
  prepareRaycastMeshes: SupportPlacementGroundSamplerOptions['prepareRaycastMeshes'];
}>;

/** The slice of KillstreakWorld this module owns. The roster half is elsewhere. */
export type SupportFlightWorld = Required<Pick<
  KillstreakWorld,
  | 'bounds'
  | 'groundHeightAt'
  | 'resolveFlightPosition'
  | 'resolveFlightEnvelopePosition'
  | 'isFlightPositionValid'
  | 'supportStrikeBoundsAt'
  | 'supportFlightCentreVolume'
>>;

/**
 * The arena's centre-overflight portal: highest altitude wins, id breaks ties
 * so the pick is deterministic across hosts. Undefined on an arena that authors
 * no portals, which the spawn altitude falls back for.
 */
export function supportFlightCentrePortal(
  definition: ArenaFlightNavigationDefinition,
): FlightPortalHint | undefined {
  return [...definition.portals]
    .sort((left, right) => right.altitudeM - left.altitudeM || left.id.localeCompare(right.id))[0];
}

/**
 * The centre spawn HF-131 asks for: the arena's horizontal midpoint, nudged by
 * the centre portal's arena-relative offset, at that portal's altitude.
 */
export function supportFlightCentreSpawn(
  definition: ArenaFlightNavigationDefinition,
  bounds: Box2,
): [number, number, number] {
  const centrePortal = supportFlightCentrePortal(definition);
  return [
    (bounds.minX + bounds.maxX) / 2
      + (centrePortal?.xQ ?? 0) * (bounds.maxX - bounds.minX) / 2,
    centrePortal?.altitudeM ?? definition.ceilingY * PORTALLESS_CENTRE_ALTITUDE_FRACTION,
    (bounds.minZ + bounds.maxZ) / 2
      + (centrePortal?.zQ ?? 0) * (bounds.maxZ - bounds.minZ) / 2,
  ];
}

/**
 * How far the swarm may spread from that centre. Capped in absolute metres so a
 * large arena does not scatter the formation across half the map.
 */
export function supportFlightCentreHalfExtents(
  definition: ArenaFlightNavigationDefinition,
  bounds: Box2,
): [number, number, number] {
  return [
    Math.min(CENTRE_VOLUME_HORIZONTAL_LIMIT_M, (bounds.maxX - bounds.minX) * CENTRE_VOLUME_HORIZONTAL_FRACTION),
    Math.min(CENTRE_VOLUME_VERTICAL_LIMIT_M, definition.ceilingY * CENTRE_VOLUME_VERTICAL_FRACTION),
    Math.min(CENTRE_VOLUME_HORIZONTAL_LIMIT_M, (bounds.maxZ - bounds.minZ) * CENTRE_VOLUME_HORIZONTAL_FRACTION),
  ];
}

/**
 * The strike region an admitted anchor belongs to. The Gun Range test bay is a
 * sealed room inside a much larger arena, so a strike admitted inside it is
 * bounded by the room rather than by the map.
 */
export function supportStrikeBoundsAt(
  arenaId: ArenaId,
  bounds: Box2,
  anchor: readonly [number, number, number],
): Readonly<{ minX: number; maxX: number; minZ: number; maxZ: number }> {
  const bay = GUN_RANGE_TEST_BAY_CONTRACT.bay.bounds;
  return arenaId === 'gun-range'
    && anchor[0] >= bay.minX && anchor[0] <= bay.maxX
    && anchor[2] >= bay.minZ && anchor[2] <= bay.maxZ
    ? bay
    : bounds;
}

/** Builds the airspace for one world snapshot. */
export function createSupportFlightWorld(input: SupportFlightWorldInput): SupportFlightWorld {
  const definition = PASS65_FLIGHT_NAVIGATION[input.arenaId];
  const centreSpawn = supportFlightCentreSpawn(definition, input.bounds);
  // Owner 2026-08-31. This was a literal 0 inherited from legacy-main, NOT
  // `definition.floorY`, and the two systems therefore disagreed about where an
  // arena's airspace begins: resolveSupportFlightStep clamps flight to
  // definition.floorY, while every consumer of `world.bounds.floorY` (spawn
  // altitudes, carpet corridors, hover clamps, the centre volume) computed
  // against 0. Every arena authors 0 EXCEPT high-seas, which authors 3.2 for the
  // yacht deck - so on that one map the placement systems were told the floor
  // was the sea, 3.2 m below the deck the mover would actually allow. Publishing
  // the authored floor makes the two agree; it is a no-op on the other seven.
  const flightBounds: SupportFlightWorld['bounds'] = {
    minX: input.bounds.minX,
    maxX: input.bounds.maxX,
    minZ: input.bounds.minZ,
    maxZ: input.bounds.maxZ,
    floorY: definition.floorY,
    ceilingY: definition.ceilingY,
  };
  // The sampler walks the scene and updates world matrices, so it is built on
  // first use and never for a world nobody samples ground from.
  let groundSampler: SupportPlacementGroundSampler | null = null;
  return {
    bounds: flightBounds,
    groundHeightAt: (x, z) => {
      groundSampler ??= new SupportPlacementGroundSampler({
        bounds: input.bounds,
        ceilingY: definition.ceilingY,
        colliders: input.solids,
        prepareRaycastMeshes: input.prepareRaycastMeshes,
      });
      return groundSampler.heightAt(x, z);
    },
    resolveFlightPosition: (from, desired, radius) => {
      const result = resolveSupportFlightStep({
        definition,
        arenaBounds: input.bounds,
        solids: input.solids,
        from: { x: from[0], y: from[1], z: from[2] },
        desired: { x: desired[0], y: desired[1], z: desired[2] },
        radius,
      });
      return [result.position.x, result.position.y, result.position.z];
    },
    resolveFlightEnvelopePosition: (from, desired, envelope) => resolveSupportAircraftEnvelopeStep({
      bounds: flightBounds,
      solids: input.solids,
      from,
      desired,
      envelope,
    }).position,
    isFlightPositionValid: (position) => {
      const point = { x: position[0], y: position[1], z: position[2] };
      return pointInsideBounds(point, input.bounds, FLIGHT_POSITION_CLEARANCE_M)
        && !input.solids.some((solid) => sphereIntersectsBox(point, FLIGHT_POSITION_CLEARANCE_M, solid));
    },
    supportStrikeBoundsAt: (anchor) => supportStrikeBoundsAt(input.arenaId, input.bounds, anchor),
    supportFlightCentreVolume: {
      centre: centreSpawn,
      halfExtents: supportFlightCentreHalfExtents(definition, input.bounds),
    },
  };
}
