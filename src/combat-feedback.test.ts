import { describe, expect, it } from 'vitest';
import { classifyImpactSurface, distancePointToSegment, nearMissStrength } from './combat-feedback';

describe('combat feedback helpers', () => {
  it('prefers explicit surface metadata and deterministic material evidence', () => {
    expect(classifyImpactSurface({ hint: 'wood', name: 'metal panel' })).toBe('wood');
    expect(classifyImpactSurface({ name: 'delivery truck body' })).toBe('metal');
    expect(classifyImpactSurface({ name: 'garden hedge' })).toBe('soil');
    expect(classifyImpactSurface({ name: 'interior wall', metalness: 0.05 })).toBe('concrete');
    expect(classifyImpactSurface({ metalness: 0.8 })).toBe('metal');
  });

  it('measures a listener against the finite visible tracer segment', () => {
    const start = { x: 0, y: 1, z: 0 };
    const end = { x: 10, y: 1, z: 0 };
    expect(distancePointToSegment({ x: 5, y: 2, z: 0 }, start, end)).toBeCloseTo(1);
    expect(distancePointToSegment({ x: 14, y: 1, z: 0 }, start, end)).toBeCloseTo(4);
  });

  it('bounds near-miss feedback outside the useful annulus', () => {
    const start = { x: 0, y: 0, z: 0 };
    const end = { x: 10, y: 0, z: 0 };
    expect(nearMissStrength({ x: 5, y: 0.8, z: 0 }, start, end)).toBeGreaterThan(0.8);
    expect(nearMissStrength({ x: 5, y: 4, z: 0 }, start, end)).toBe(0);
    expect(nearMissStrength({ x: 5, y: 0.1, z: 0 }, start, end)).toBe(0);
  });
});
