import { describe, expect, it } from 'vitest';
import { ARENA_SELECTIONS } from '../map-selection';
import { FARCRYSIS_BOUNDS } from '../farcrysis-constants';
import { farcrysisTerrainHeight } from '../farcrysis-terrain-authority';
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

  it('gates float-zone/buoyancy at the authored shoreline, not the pre-rescale island', () => {
    // The island box is the dry/wet authority for samplePhysics and the
    // float-zone: consumers gate at (islandHalf + 0.8) * 0.98 Chebyshev. The
    // stale ±32 figure predated the HF-396 4x rescale to ±64, so the whole
    // outer jungle band (Chebyshev 32.1 .. shoreline) was gated as open ocean
    // and a PRONE player on dry sand there sat inside the buoyancy gate
    // (prone eye ~1.06 m above the surface clears the depth > -1.2 test).
    const body = waterBodyForArena('farcrysis');
    expect(body).not.toBeNull();
    const level = body!.level;
    // Authored waterline Chebyshev distance, measured from the live terrain
    // authority on both axes rather than restated here.
    const waterline = (axis: 'x' | 'z'): number => {
      const limit = axis === 'x' ? FARCRYSIS_BOUNDS.maxX : FARCRYSIS_BOUNDS.maxZ;
      for (let d = 0; d <= limit; d += 0.05) {
        const height = axis === 'x' ? farcrysisTerrainHeight(d, 0) : farcrysisTerrainHeight(0, d);
        if (height < level) return d;
      }
      return -1;
    };
    const shoreX = waterline('x');
    const shoreZ = waterline('z');
    expect(shoreX).toBeGreaterThan(0);
    expect(shoreZ).toBeGreaterThan(0);
    const boundaryX = (body!.island.halfX + 0.8) * 0.98;
    const boundaryZ = (body!.island.halfZ + 0.8) * 0.98;
    // Dry beach must stay INSIDE the dry gate (0.25 m measurement tolerance),
    // and the box must still leave open water inside the arena bounds.
    expect(boundaryX).toBeGreaterThanOrEqual(shoreX - 0.25);
    expect(boundaryZ).toBeGreaterThanOrEqual(shoreZ - 0.25);
    expect(boundaryX).toBeLessThanOrEqual(shoreX + 1.0);
    expect(boundaryZ).toBeLessThanOrEqual(shoreZ + 1.0);
    expect(body!.island.halfX).toBeLessThan(FARCRYSIS_BOUNDS.maxX);
  });
 });
