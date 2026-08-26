import { GUN_RANGE_TEST_BAY_CONTRACT, gunRangeTestBayDummyPose, type GunRangeTestBayDummyDefinition } from './gun-range-test-bay';
import type { DynamicWorldCollider } from './physics';
import type { Box2 } from './collision';

/** Half-extents for the movement collider cuboid (HF-318). */
const DUMMY_HALF_EXTENTS = Object.freeze({ x: 0.36, y: 1.05, z: 0.36 });

/** Derives the movement collider for a single active training dummy. */
function buildDummyCollider(definition: GunRangeTestBayDummyDefinition, nowMs: number): DynamicWorldCollider {
  const pose = gunRangeTestBayDummyPose(definition, nowMs);
  const bounds: Box2 = Object.freeze({
    minX: pose.position.x - DUMMY_HALF_EXTENTS.x,
    maxX: pose.position.x + DUMMY_HALF_EXTENTS.x,
    // HF-318 audit fix: the pose position is the dummy's FEET, not its centre.
    // Subtracting the half-extent buried half the collider underground and left
    // only the lower half of a 2.1 m dummy solid, so shots and sweeps passed
    // through its head and torso. Span upward from the feet instead.
    minY: pose.position.y,
    maxY: pose.position.y + DUMMY_HALF_EXTENTS.y * 2,
    minZ: pose.position.z - DUMMY_HALF_EXTENTS.z,
    maxZ: pose.position.z + DUMMY_HALF_EXTENTS.z,
  });
  return Object.freeze({ id: `test-dummy:${definition.id}`, bounds });
}

/**
 * Pure derivation of movement colliders for all ACTIVE test-bay training dummies.
 * Returns an empty array when no dummies are active (HF-318).
 */
export function gunRangeTestBayDummyColliders(
  activeDummyIds: readonly string[],
  nowMs: number,
): readonly DynamicWorldCollider[] {
  if (!Number.isFinite(nowMs) || nowMs < 0) throw new TypeError('dummy time must be finite and non-negative');
  const active = new Set(activeDummyIds);
  const colliders: DynamicWorldCollider[] = [];
  for (const definition of GUN_RANGE_TEST_BAY_CONTRACT.dummies) {
    if (!active.has(definition.id)) continue;
    colliders.push(buildDummyCollider(definition, nowMs));
  }
  return Object.freeze(colliders);
}

/**
 * Checks whether a dummy definition is currently considered active.
 * Exported for testability of the active-filtering logic.
 */
export function isDummyActive(definition: GunRangeTestBayDummyDefinition, activeDummyIds: readonly string[]): boolean {
  return activeDummyIds.includes(definition.id);
}