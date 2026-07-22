import { ARENA_BOUNDS } from './arena-layout';

export type ArenaRouteId = 'west-cultivation' | 'central-transit' | 'east-service';
export type ArenaRouteIdentity = {
  id: ArenaRouteId;
  label: string;
  role: 'concealed-flank' | 'broad-exposed' | 'technical-cover';
  primaryColor: number;
  secondaryColor: number;
  landmark: string;
  cuePositions: ReadonlyArray<readonly [number, number]>;
};

/**
 * Original route-language contract. Coordinates are presentation cues only and
 * never become collision, navigation or spawn authority.
 */
export const ARENA_ROUTE_IDENTITIES: ReadonlyArray<ArenaRouteIdentity> = Object.freeze([
  Object.freeze({
    id: 'west-cultivation' as const,
    label: 'VERDANT ARRAY',
    role: 'concealed-flank' as const,
    primaryColor: 0x668f49,
    secondaryColor: 0x7c3fa0,
    landmark: 'hydroponics-greenhouse',
    cuePositions: Object.freeze([
      Object.freeze([-27, -11] as const),
      Object.freeze([-25.5, 16] as const),
      Object.freeze([-21, 28] as const),
    ]),
  }),
  Object.freeze({
    id: 'central-transit' as const,
    label: 'CIVIC TRANSIT',
    role: 'broad-exposed' as const,
    primaryColor: 0xb8793f,
    secondaryColor: 0xe4bd64,
    landmark: 'civil-defence-transit',
    cuePositions: Object.freeze([
      Object.freeze([-3.8, 7] as const),
      Object.freeze([4.2, -9] as const),
      Object.freeze([0, 31] as const),
    ]),
  }),
  Object.freeze({
    id: 'east-service' as const,
    label: 'HELIO SERVICE',
    role: 'technical-cover' as const,
    primaryColor: 0x2f7187,
    secondaryColor: 0x8b59ba,
    landmark: 'solar-battery-yard',
    cuePositions: Object.freeze([
      Object.freeze([26, -16] as const),
      Object.freeze([27, -1.5] as const),
      Object.freeze([25.5, 21] as const),
    ]),
  }),
]);

export function routeIdentityForPosition(x: number): ArenaRouteIdentity {
  if (x < -17) return ARENA_ROUTE_IDENTITIES[0];
  if (x > 17) return ARENA_ROUTE_IDENTITIES[2];
  return ARENA_ROUTE_IDENTITIES[1];
}

export function routeIdentityTelemetry(): {
  pass: 'world-identity-27';
  routes: Array<Pick<ArenaRouteIdentity, 'id' | 'label' | 'role' | 'landmark'>>;
  cuesInsideBounds: boolean;
} {
  return {
    pass: 'world-identity-27',
    routes: ARENA_ROUTE_IDENTITIES.map(({ id, label, role, landmark }) => ({ id, label, role, landmark })),
    cuesInsideBounds: ARENA_ROUTE_IDENTITIES.every((route) => route.cuePositions.every(([x, z]) => (
      x >= ARENA_BOUNDS.minX && x <= ARENA_BOUNDS.maxX && z >= ARENA_BOUNDS.minZ && z <= ARENA_BOUNDS.maxZ
    ))),
  };
}
