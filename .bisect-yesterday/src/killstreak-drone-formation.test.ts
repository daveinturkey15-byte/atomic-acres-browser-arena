import { describe, expect, it } from 'vitest';
import {
  DRONE_SWARM_ENGAGEMENT_FORMATION,
  droneSwarmEngagementOffset,
  droneSwarmEngagementPoint,
} from './killstreak-drone-formation';

function minimumPairDistance(points: readonly (readonly number[])[]): number {
  let minimum = Number.POSITIVE_INFINITY;
  for (let left = 0; left < points.length; left += 1) {
    for (let right = left + 1; right < points.length; right += 1) {
      minimum = Math.min(minimum, Math.hypot(
        points[left]![0]! - points[right]![0]!,
        points[left]![1]! - points[right]![1]!,
        points[left]![2]! - points[right]![2]!,
      ));
    }
  }
  return minimum;
}

describe('drone Swarm engagement formation', () => {
  it('creates four deterministic six-unit clusters with no shared target point', () => {
    const offsets = Array.from({ length: 24 }, (_, ordinal) => droneSwarmEngagementOffset({
      activationId: 'activation-swarm-1',
      targetId: 'target-a',
      ordinal,
    }));
    expect(offsets).toEqual(Array.from({ length: 24 }, (_, ordinal) => droneSwarmEngagementOffset({
      activationId: 'activation-swarm-1',
      targetId: 'target-a',
      ordinal,
    })));
    expect(new Set(offsets.map((offset) => offset.map((value) => value.toFixed(6)).join(':'))).size).toBe(24);
    expect(minimumPairDistance(offsets)).toBeGreaterThanOrEqual(
      DRONE_SWARM_ENGAGEMENT_FORMATION.minimumDesignedSeparationM,
    );
    for (let cluster = 0; cluster < DRONE_SWARM_ENGAGEMENT_FORMATION.clusterCount; cluster += 1) {
      expect(Array.from({ length: 24 }, (_, ordinal) => ordinal)
        .filter((ordinal) => ordinal % DRONE_SWARM_ENGAGEMENT_FORMATION.clusterCount === cluster)).toHaveLength(6);
    }
  });

  it('rotates the formation deterministically per activation and target without changing spacing', () => {
    const offsets = (activationId: string, targetId: string) => Array.from(
      { length: 24 },
      (_, ordinal) => droneSwarmEngagementOffset({ activationId, targetId, ordinal }),
    );
    const first = offsets('activation-a', 'target-a');
    const activationChanged = offsets('activation-b', 'target-a');
    const targetChanged = offsets('activation-a', 'target-b');
    expect(activationChanged).not.toEqual(first);
    expect(targetChanged).not.toEqual(first);
    expect(minimumPairDistance(activationChanged)).toBeCloseTo(minimumPairDistance(first), 10);
    expect(minimumPairDistance(targetChanged)).toBeCloseTo(minimumPairDistance(first), 10);
  });

  it('anchors every offset around the authoritative target height and position', () => {
    const target = [10, 2, -8] as const;
    const offset = droneSwarmEngagementOffset({ activationId: 'activation-a', targetId: 'target-a', ordinal: 7 });
    expect(droneSwarmEngagementPoint(target, {
      activationId: 'activation-a', targetId: 'target-a', ordinal: 7,
    })).toEqual([target[0] + offset[0], target[1] + 1.5 + offset[1], target[2] + offset[2]]);
    expect(() => droneSwarmEngagementOffset({ activationId: 'a', targetId: 'b', ordinal: 24 })).toThrow(/0\.\.23/);
  });
});
