import { describe, expect, it } from 'vitest';
import { ARENA_SELECTIONS } from '../map-selection';
import { WATER_BODIES, sharedWaterBodyForArena, waterBodyForArena } from './water-authoring';

describe('arena water authoring', () => {
  it('records bounded, canonical definitions for every surrounding ocean', () => {
    expect(Object.keys(WATER_BODIES).sort()).toEqual(['farcrysis', 'high-seas', 'rustworks-1v1']);
    for (const body of Object.values(WATER_BODIES)) {
      expect(ARENA_SELECTIONS.some((arena) => arena.id === body?.arenaId)).toBe(true);
      expect(body?.shore.outerRadius).toBeGreaterThan(body?.shore.innerRadius ?? 0);
      expect(body?.horizonRadius).toBeGreaterThan(body?.nearSize ?? 0);
      expect(body?.amplitudeScale).toBeGreaterThan(0);
    }
  });

  it('makes shared ownership explicit and avoids duplicating Farcrysis water', () => {
    expect(sharedWaterBodyForArena('rustworks-1v1')?.presentationOwner).toBe('shared-ocean');
    expect(sharedWaterBodyForArena('high-seas')?.presentationOwner).toBe('shared-ocean');
    expect(sharedWaterBodyForArena('high-seas')).toMatchObject({ level: -2.2, amplitudeScale: 0.15, dryFootprintMask: 'none' });
    expect(sharedWaterBodyForArena('rustworks-1v1')?.dryFootprintMask).toBe('rectangular');
    expect(waterBodyForArena('farcrysis')).toMatchObject({
      presentationOwner: 'arena-builder',
      amplitudeScale: 0.2,
    });
    expect(sharedWaterBodyForArena('farcrysis')).toBeNull();
    expect(sharedWaterBodyForArena('atomic-acres')).toBeNull();
  });
});
