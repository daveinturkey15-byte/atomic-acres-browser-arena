import type { ArenaId } from './map-selection';
import { sphereIntersectsBox, sweepSphereAgainstBoxes, type Box2, type Point3 } from './collision';

export type FlightPortalHint = Readonly<{
  id: string;
  /** Arena-relative horizontal coordinates in the inclusive -1..1 range. */
  xQ: number;
  zQ: number;
  altitudeM: number;
}>;

export type ArenaFlightNavigationDefinition = Readonly<{
  id: string;
  arenaId: ArenaId;
  floorY: number;
  ceilingY: number;
  noFlyPolicy: 'authoritative-static-and-dynamic-solids';
  portals: readonly FlightPortalHint[];
}>;

const definition = (
  arenaId: ArenaId,
  ceilingY: number,
  portals: readonly FlightPortalHint[],
): ArenaFlightNavigationDefinition => Object.freeze({
  id: `${arenaId}-support-flight-v1`,
  arenaId,
  floorY: 0,
  ceilingY,
  noFlyPolicy: 'authoritative-static-and-dynamic-solids',
  portals: Object.freeze(portals.map((portal) => Object.freeze(portal))),
});

/**
 * Arena-owned recovery hints complement, but never replace, the current
 * authoritative collider set. A hint is used only when the swept sphere path
 * to it is clear, so presentation meshes can never become flight authority.
 */
export const PASS65_FLIGHT_NAVIGATION: Readonly<Record<ArenaId, ArenaFlightNavigationDefinition>> = Object.freeze({
  'atomic-acres': definition('atomic-acres', 42, [
    { id: 'north-street-air-gap', xQ: 0, zQ: -0.72, altitudeM: 7.5 },
    { id: 'south-street-air-gap', xQ: 0, zQ: 0.72, altitudeM: 7.5 },
    { id: 'central-overflight', xQ: 0, zQ: 0, altitudeM: 18 },
  ]),
  'rustworks-1v1': definition('rustworks-1v1', 42, [
    { id: 'undercroft-west-portal', xQ: -0.16, zQ: 0, altitudeM: 1.7 },
    { id: 'undercroft-east-portal', xQ: 0.16, zQ: 0, altitudeM: 1.7 },
    { id: 'tower-overflight', xQ: 0, zQ: 0, altitudeM: 20 },
  ]),
  'gun-range': definition('gun-range', 18, [
    // The killstreak test bay occupies the east block (x 51.5-100, z -26-38).
    // Centre the flight portal on the bay interior so support aircraft spawn
    // and recover inside the large room rather than at the map centre outside it.
    { id: 'range-lane', xQ: 0.6, zQ: 0.26, altitudeM: 4.5 },
  ]),
  'skyline-terminal': definition('skyline-terminal', 42, [
    { id: 'open-apron', xQ: 0, zQ: -0.52, altitudeM: 9 },
    { id: 'boarding-portal', xQ: 0, zQ: 0.08, altitudeM: 4.2 },
    { id: 'terminal-overflight', xQ: 0, zQ: 0, altitudeM: 20 },
  ]),
  // HF-359 (Pass 74): ported from the Pass 69 hidden lane.
  'farcrysis': definition('farcrysis', 42, [
    { id: 'beach-overflight', xQ: -0.7, zQ: 0.6, altitudeM: 15 },
    { id: 'jungle-air-gap', xQ: 0, zQ: 0, altitudeM: 20 },
  ]),
});

export type SupportFlightStepInput = Readonly<{
  definition: ArenaFlightNavigationDefinition;
  arenaBounds: Box2;
  solids: readonly Box2[];
  from: Point3;
  desired: Point3;
  radius: number;
}>;

export type SupportFlightStep = Readonly<{
  position: Point3;
  collided: boolean;
  recovery: 'direct' | 'slide' | 'axis' | 'climb' | 'portal' | 'hold';
}>;

function clampPoint(input: SupportFlightStepInput, point: Point3): Point3 {
  const { arenaBounds, definition, radius } = input;
  return {
    x: Math.max(arenaBounds.minX + radius, Math.min(point.x, arenaBounds.maxX - radius)),
    y: Math.max(definition.floorY + radius, Math.min(point.y, definition.ceilingY - radius)),
    z: Math.max(arenaBounds.minZ + radius, Math.min(point.z, arenaBounds.maxZ - radius)),
  };
}

function delta(from: Point3, to: Point3): Point3 {
  return { x: to.x - from.x, y: to.y - from.y, z: to.z - from.z };
}

function magnitude(vector: Point3): number {
  return Math.hypot(vector.x, vector.y, vector.z);
}

function clearStep(from: Point3, to: Point3, solids: readonly Box2[], radius: number): boolean {
  const movement = delta(from, to);
  return !solids.some((solid) => sphereIntersectsBox(to, radius, solid))
    && (magnitude(movement) < 1e-8 || sweepSphereAgainstBoxes(from, movement, solids, radius) === null);
}

function absolutePortal(input: SupportFlightStepInput, portal: FlightPortalHint): Point3 {
  const { arenaBounds, definition, radius } = input;
  return clampPoint(input, {
    x: (arenaBounds.minX + arenaBounds.maxX) / 2 + portal.xQ * (arenaBounds.maxX - arenaBounds.minX) / 2,
    y: Math.max(definition.floorY + radius, Math.min(portal.altitudeM, definition.ceilingY - radius)),
    z: (arenaBounds.minZ + arenaBounds.maxZ) / 2 + portal.zQ * (arenaBounds.maxZ - arenaBounds.minZ) / 2,
  });
}

/**
 * Resolves one support-flight step against the same current static + dynamic
 * solids used by movement and LOS. Portals remain real gaps in those solids;
 * the authored hints only provide deterministic recovery direction.
 */
export function resolveSupportFlightStep(input: SupportFlightStepInput): SupportFlightStep {
  if (!Number.isFinite(input.radius) || input.radius <= 0) throw new Error('support-flight radius must be positive and finite');
  const from = clampPoint(input, input.from);
  const desired = clampPoint(input, input.desired);
  if (clearStep(from, desired, input.solids, input.radius)) {
    return Object.freeze({ position: Object.freeze(desired), collided: false, recovery: 'direct' });
  }

  const movement = delta(from, desired);
  const hit = sweepSphereAgainstBoxes(from, movement, input.solids, input.radius);
  if (hit) {
    const contactTime = Math.max(0, hit.time - 0.002 / Math.max(magnitude(movement), 0.002));
    const contact = clampPoint(input, {
      x: from.x + movement.x * contactTime,
      y: from.y + movement.y * contactTime,
      z: from.z + movement.z * contactTime,
    });
    const remaining = {
      x: movement.x * (1 - hit.time),
      y: movement.y * (1 - hit.time),
      z: movement.z * (1 - hit.time),
    };
    const intoNormal = remaining.x * hit.normal.x + remaining.y * hit.normal.y + remaining.z * hit.normal.z;
    const slide = clampPoint(input, {
      x: contact.x + remaining.x - hit.normal.x * Math.min(0, intoNormal),
      y: contact.y + remaining.y - hit.normal.y * Math.min(0, intoNormal),
      z: contact.z + remaining.z - hit.normal.z * Math.min(0, intoNormal),
    });
    if (magnitude(delta(contact, slide)) >= 0.05 && clearStep(contact, slide, input.solids, input.radius)) {
      return Object.freeze({ position: Object.freeze(slide), collided: true, recovery: 'slide' });
    }
  }

  const axisCandidates = [
    clampPoint(input, { x: desired.x, y: from.y, z: from.z }),
    clampPoint(input, { x: from.x, y: desired.y, z: from.z }),
    clampPoint(input, { x: from.x, y: from.y, z: desired.z }),
  ];
  for (const candidate of axisCandidates) {
    if (magnitude(delta(from, candidate)) < 1e-5) continue;
    if (clearStep(from, candidate, input.solids, input.radius)) {
      return Object.freeze({ position: Object.freeze(candidate), collided: true, recovery: 'axis' });
    }
  }

  const climb = clampPoint(input, { x: from.x, y: from.y + Math.max(1, input.radius * 2), z: from.z });
  if (clearStep(from, climb, input.solids, input.radius)) {
    return Object.freeze({ position: Object.freeze(climb), collided: true, recovery: 'climb' });
  }

  const stepLength = Math.max(0.5, magnitude(movement));
  const portals = input.definition.portals
    .map((portal) => absolutePortal(input, portal))
    .sort((left, right) => magnitude(delta(from, left)) - magnitude(delta(from, right)));
  for (const portal of portals) {
    const direction = delta(from, portal);
    const length = magnitude(direction);
    if (length < 1e-6) continue;
    const candidate = clampPoint(input, {
      x: from.x + direction.x / length * Math.min(stepLength, length),
      y: from.y + direction.y / length * Math.min(stepLength, length),
      z: from.z + direction.z / length * Math.min(stepLength, length),
    });
    if (clearStep(from, candidate, input.solids, input.radius)) {
      return Object.freeze({ position: Object.freeze(candidate), collided: true, recovery: 'portal' });
    }
  }
  return Object.freeze({ position: Object.freeze(from), collided: true, recovery: 'hold' });
}
