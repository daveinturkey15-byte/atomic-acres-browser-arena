export type DroneFormationVec3 = readonly [number, number, number];

export const DRONE_SWARM_ENGAGEMENT_FORMATION = Object.freeze({
  unitCount: 24,
  clusterCount: 4,
  unitsPerCluster: 6,
  clusterRadiusM: 5.5,
  memberRadiusM: 1.6,
  verticalStepM: 0.55,
  minimumDesignedSeparationM: 1.5,
} as const);

function hashText(value: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/**
 * Four six-drone clusters surround one target without sharing a destination.
 * The activation/target phase is deterministic host state, never client pose.
 */
export function droneSwarmEngagementOffset(input: Readonly<{
  activationId: string;
  targetId: string;
  ordinal: number;
}>): DroneFormationVec3 {
  if (!Number.isSafeInteger(input.ordinal)
    || input.ordinal < 0
    || input.ordinal >= DRONE_SWARM_ENGAGEMENT_FORMATION.unitCount) {
    throw new Error('swarm formation ordinal must be in the inclusive 0..23 range');
  }
  const cluster = input.ordinal % DRONE_SWARM_ENGAGEMENT_FORMATION.clusterCount;
  const member = Math.floor(input.ordinal / DRONE_SWARM_ENGAGEMENT_FORMATION.clusterCount);
  const phase = hashText(`${input.activationId}:${input.targetId}`) / 0x1_0000_0000 * Math.PI * 2;
  const clusterAngle = phase + cluster / DRONE_SWARM_ENGAGEMENT_FORMATION.clusterCount * Math.PI * 2;
  const memberAngle = phase + cluster * 0.17
    + member / DRONE_SWARM_ENGAGEMENT_FORMATION.unitsPerCluster * Math.PI * 2;
  const x = Math.cos(clusterAngle) * DRONE_SWARM_ENGAGEMENT_FORMATION.clusterRadiusM
    + Math.cos(memberAngle) * DRONE_SWARM_ENGAGEMENT_FORMATION.memberRadiusM;
  const z = Math.sin(clusterAngle) * DRONE_SWARM_ENGAGEMENT_FORMATION.clusterRadiusM
    + Math.sin(memberAngle) * DRONE_SWARM_ENGAGEMENT_FORMATION.memberRadiusM;
  const y = ((member % 3) - 1) * DRONE_SWARM_ENGAGEMENT_FORMATION.verticalStepM
    + (cluster % 2 === 0 ? -0.25 : 0.25);
  return Object.freeze([x, y, z] as const);
}

export function droneSwarmEngagementPoint(
  targetPosition: DroneFormationVec3,
  input: Parameters<typeof droneSwarmEngagementOffset>[0],
): DroneFormationVec3 {
  const offset = droneSwarmEngagementOffset(input);
  return Object.freeze([
    targetPosition[0] + offset[0],
    targetPosition[1] + 1.5 + offset[1],
    targetPosition[2] + offset[2],
  ] as const);
}
