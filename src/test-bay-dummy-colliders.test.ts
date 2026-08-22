import { describe, expect, it } from 'vitest';
import {
  GUN_RANGE_TEST_BAY_CONTRACT,
  gunRangeTestBayDummyPose,
} from './gun-range-test-bay';
import {
  gunRangeTestBayDummyColliders,
  isDummyActive,
} from './test-bay-dummy-colliders';

describe('Gun Range test-bay dummy movement colliders (HF-318)', () => {
  it('produces one collider per active dummy with correct id format', () => {
    const nowMs = 0;
    const activeIds = GUN_RANGE_TEST_BAY_CONTRACT.dummies.map((d) => d.id);
    const colliders = gunRangeTestBayDummyColliders(activeIds, nowMs);

    expect(colliders).toHaveLength(4);
    for (const collider of colliders) {
      expect(collider.id).toMatch(/^test-dummy:test-dummy-(alpha|bravo|charlie|delta)$/);
      expect(collider.bounds).toBeDefined();
      expect(collider.bounds.minX).toBeLessThan(collider.bounds.maxX);
      expect((collider.bounds.minY ?? 0)).toBeLessThan(collider.bounds.maxY ?? 0);
      expect(collider.bounds.minZ).toBeLessThan(collider.bounds.maxZ);
    }
  });

  it('centres each collider on the dummy\'s current patrol pose', () => {
    const nowMs = 1_000;
    const activeIds = GUN_RANGE_TEST_BAY_CONTRACT.dummies.map((d) => d.id);
    const colliders = gunRangeTestBayDummyColliders(activeIds, nowMs);

    for (const collider of colliders) {
      const dummyId = collider.id.replace('test-dummy:', '');
      const definition = GUN_RANGE_TEST_BAY_CONTRACT.dummies.find((d) => d.id === dummyId)!;
      const pose = gunRangeTestBayDummyPose(definition, nowMs);
      const centreX = (collider.bounds.minX + collider.bounds.maxX) / 2;
      const centreY = ((collider.bounds.minY ?? 0) + (collider.bounds.maxY ?? 0)) / 2;
      const centreZ = (collider.bounds.minZ + collider.bounds.maxZ) / 2;

      expect(centreX).toBeCloseTo(pose.position.x, 6);
      // HF-318 audit fix: the pose y is the dummy's FEET, so a body standing on it
      // has its centre one half-height above, not at, that point.
      expect(centreY).toBeCloseTo(pose.position.y + 1.05, 6);
      expect(centreZ).toBeCloseTo(pose.position.z, 6);
    }
  });

  it('uses the correct half-extents (0.36 x 1.05 x 0.36)', () => {
    const nowMs = 0;
    const activeIds = [GUN_RANGE_TEST_BAY_CONTRACT.dummies[0]!.id];
    const colliders = gunRangeTestBayDummyColliders(activeIds, nowMs);

    expect(colliders).toHaveLength(1);
    const c = colliders[0]!.bounds;
    expect(c.maxX - c.minX).toBeCloseTo(0.72, 6);
    expect((c.maxY ?? 0) - (c.minY ?? 0)).toBeCloseTo(2.1, 6);
    expect(c.maxZ - c.minZ).toBeCloseTo(0.72, 6);
  });

  it('returns empty array when no dummies are active', () => {
    const colliders = gunRangeTestBayDummyColliders([], 0);
    expect(colliders).toHaveLength(0);
  });

  it('returns empty array when active set is empty', () => {
    const colliders = gunRangeTestBayDummyColliders([], 5_000);
    expect(colliders).toHaveLength(0);
  });

  it('filters out retired dummies - only active ones get colliders', () => {
    const nowMs = 0;
    const allIds = GUN_RANGE_TEST_BAY_CONTRACT.dummies.map((d) => d.id);
    const onlyAlpha = [allIds[0]!];

    const allColliders = gunRangeTestBayDummyColliders(allIds, nowMs);
    const alphaOnlyColliders = gunRangeTestBayDummyColliders(onlyAlpha, nowMs);

    expect(allColliders).toHaveLength(4);
    expect(alphaOnlyColliders).toHaveLength(1);
    expect(alphaOnlyColliders[0]!.id).toBe('test-dummy:test-dummy-alpha');
  });

  it('stable ids across time - same dummy always gets same collider id', () => {
    const activeIds = GUN_RANGE_TEST_BAY_CONTRACT.dummies.map((d) => d.id);

    const c1 = gunRangeTestBayDummyColliders(activeIds, 0);
    const c2 = gunRangeTestBayDummyColliders(activeIds, 10_000);
    const c3 = gunRangeTestBayDummyColliders(activeIds, 50_000);

    expect(c1.map((c) => c.id).sort()).toEqual(c2.map((c) => c.id).sort());
    expect(c2.map((c) => c.id).sort()).toEqual(c3.map((c) => c.id).sort());
  });

  it('collider positions change as dummies patrol between start and end', () => {
    const activeIds = GUN_RANGE_TEST_BAY_CONTRACT.dummies.map((d) => d.id);

    const cEarly = gunRangeTestBayDummyColliders(activeIds, 0);
    const cLate = gunRangeTestBayDummyColliders(activeIds, 20_000);

    // At least one dummy should have moved between these times
    let anyMoved = false;
    for (const early of cEarly) {
      const late = cLate.find((c) => c.id === early.id)!;
      const dx = Math.abs((early.bounds.minX + early.bounds.maxX) / 2 - (late.bounds.minX + late.bounds.maxX) / 2);
      const dz = Math.abs((early.bounds.minZ + early.bounds.minZ) / 2 - (late.bounds.minZ + late.bounds.maxZ) / 2);
      if (dx > 0.01 || dz > 0.01) anyMoved = true;
    }
    expect(anyMoved).toBe(true);
  });

  it('throws on invalid (negative) time', () => {
    expect(() => gunRangeTestBayDummyColliders(['test-dummy-alpha'], -1)).toThrow();
  });

  it('throws on invalid (NaN) time', () => {
    expect(() => gunRangeTestBayDummyColliders(['test-dummy-alpha'], Number.NaN)).toThrow();
  });

  it('isDummyActive helper correctly identifies active dummies', () => {
    const def = GUN_RANGE_TEST_BAY_CONTRACT.dummies[0]!;
    expect(isDummyActive(def, ['test-dummy-alpha'])).toBe(true);
    expect(isDummyActive(def, ['test-dummy-bravo'])).toBe(false);
    expect(isDummyActive(def, [])).toBe(false);
  });

  it('colliders are frozen (immutable)', () => {
    const colliders = gunRangeTestBayDummyColliders(['test-dummy-alpha'], 0);
    expect(Object.isFrozen(colliders)).toBe(true);
    expect(Object.isFrozen(colliders[0]!)).toBe(true);
    expect(Object.isFrozen(colliders[0]!.bounds)).toBe(true);
  });

  it('collider y-bounds extend from ground to ~2.1m (dummy height)', () => {
    const colliders = gunRangeTestBayDummyColliders(['test-dummy-alpha'], 0);
    const c = colliders[0]!.bounds;
    // HF-318 audit fix: this test's TITLE was always right and its assertion was
    // always wrong. The pose position is the dummy's FEET, so centring the collider
    // on it buried half underground and left only the lower half of a 2.1 m dummy
    // solid - shots and sweeps passed through its head and torso while the suite
    // stayed green. The collider now spans upward from the ground, as the name says.
    expect(c.minY ?? 0).toBeCloseTo(0, 6);
    expect(c.maxY ?? 0).toBeCloseTo(2.1, 6);
  });
});