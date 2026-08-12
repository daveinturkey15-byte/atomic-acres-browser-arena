import type { Box2, OrientedBoxSweepEnvelope, Point3 } from './collision';
import { orientedBoxIntersectsBox, sweepOrientedBoxAgainstBoxes } from './collision';

export type SupportAircraftCollisionEnvelope = Readonly<{
  halfExtents: readonly [number, number, number];
  centreOffset: readonly [number, number, number];
  yaw: number;
}>;

/**
 * LOD0/1 shipped presentation bounds after the production 17m scale:
 * 17.000 x 1.651 x 10.311m, centred 0.013m down and 0.791m forward of root.
 * LOD2 is vertically smaller, so this envelope conservatively covers all LODs.
 */
export const CARPET_BOMBER_COLLISION_ENVELOPE = Object.freeze({
  halfExtents: Object.freeze([8.5, 0.826, 5.156] as const),
  centreOffset: Object.freeze([0, -0.013, -0.791] as const),
} as const);

export type SupportAircraftRootClearance = Readonly<{
  negativeX: number;
  positiveX: number;
  negativeY: number;
  positiveY: number;
  negativeZ: number;
  positiveZ: number;
}>;

function pointEnvelope(envelope: SupportAircraftCollisionEnvelope): OrientedBoxSweepEnvelope {
  return {
    halfExtents: { x: envelope.halfExtents[0], y: envelope.halfExtents[1], z: envelope.halfExtents[2] },
    centreOffset: { x: envelope.centreOffset[0], y: envelope.centreOffset[1], z: envelope.centreOffset[2] },
    yaw: envelope.yaw,
  };
}

function worldOffset(envelope: SupportAircraftCollisionEnvelope): Point3 {
  const cosine = Math.cos(envelope.yaw);
  const sine = Math.sin(envelope.yaw);
  return {
    x: cosine * envelope.centreOffset[0] + sine * envelope.centreOffset[2],
    y: envelope.centreOffset[1],
    z: -sine * envelope.centreOffset[0] + cosine * envelope.centreOffset[2],
  };
}

export function supportAircraftRootClearance(
  envelope: SupportAircraftCollisionEnvelope,
): SupportAircraftRootClearance {
  const cosine = Math.cos(envelope.yaw);
  const sine = Math.sin(envelope.yaw);
  const extentX = Math.abs(cosine) * envelope.halfExtents[0] + Math.abs(sine) * envelope.halfExtents[2];
  const extentZ = Math.abs(sine) * envelope.halfExtents[0] + Math.abs(cosine) * envelope.halfExtents[2];
  const offset = worldOffset(envelope);
  return Object.freeze({
    negativeX: extentX - offset.x,
    positiveX: extentX + offset.x,
    negativeY: envelope.halfExtents[1] - offset.y,
    positiveY: envelope.halfExtents[1] + offset.y,
    negativeZ: extentZ - offset.z,
    positiveZ: extentZ + offset.z,
  });
}

/** Exact fixed-yaw OBB overlap gate, including rotated collider cross-axes. */
export function supportAircraftEnvelopeIntersectsBox(
  root: Point3,
  envelope: SupportAircraftCollisionEnvelope,
  box: Box2,
): boolean {
  return orientedBoxIntersectsBox(root, pointEnvelope(envelope), box);
}

export type SupportAircraftEnvelopeStep = Readonly<{
  position: readonly [number, number, number];
  collided: boolean;
  recovery: 'direct' | 'contact' | 'hold';
}>;

export function resolveSupportAircraftEnvelopeStep(input: Readonly<{
  bounds: Readonly<{ minX: number; maxX: number; minZ: number; maxZ: number; floorY: number; ceilingY: number }>;
  solids: readonly Box2[];
  from: readonly [number, number, number];
  desired: readonly [number, number, number];
  envelope: SupportAircraftCollisionEnvelope;
}>): SupportAircraftEnvelopeStep {
  const clearance = supportAircraftRootClearance(input.envelope);
  const clampRoot = (position: readonly [number, number, number]): [number, number, number] => [
    Math.max(input.bounds.minX + clearance.negativeX, Math.min(position[0], input.bounds.maxX - clearance.positiveX)),
    Math.max(input.bounds.floorY + clearance.negativeY, Math.min(position[1], input.bounds.ceilingY - clearance.positiveY)),
    Math.max(input.bounds.minZ + clearance.negativeZ, Math.min(position[2], input.bounds.maxZ - clearance.positiveZ)),
  ];
  const from = clampRoot(input.from);
  const desired = clampRoot(input.desired);
  const movement = { x: desired[0] - from[0], y: desired[1] - from[1], z: desired[2] - from[2] };
  const collisionEnvelope = pointEnvelope(input.envelope);
  const hit = sweepOrientedBoxAgainstBoxes(
    { x: from[0], y: from[1], z: from[2] },
    movement,
    input.solids,
    collisionEnvelope,
  );
  if (!hit) return Object.freeze({ position: Object.freeze(desired), collided: false, recovery: 'direct' });
  const length = Math.hypot(movement.x, movement.y, movement.z);
  const contactTime = Math.max(0, hit.time - 0.004 / Math.max(0.004, length));
  const contact = clampRoot([
    from[0] + movement.x * contactTime,
    from[1] + movement.y * contactTime,
    from[2] + movement.z * contactTime,
  ]);
  if (input.solids.some((solid) => supportAircraftEnvelopeIntersectsBox(
    { x: contact[0], y: contact[1], z: contact[2] }, input.envelope, solid,
  ))) return Object.freeze({ position: Object.freeze(from), collided: true, recovery: 'hold' });
  return Object.freeze({ position: Object.freeze(contact), collided: true, recovery: 'contact' });
}
