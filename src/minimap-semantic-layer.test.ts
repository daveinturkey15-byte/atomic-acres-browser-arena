import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  ALL_ARENA_IDS,
  installHeadlessArenaShims,
  loadArenaFactories,
} from '../scripts/qa/collider-visual-parity-core';
import {
  MINIMAP_CLASS_TABLE,
  MINIMAP_MIN_SEGMENT_PX,
  buildMinimapStructuralElements,
  classifyMinimapSurface,
} from './minimap';
import type { ArenaMap } from './map';

type MinimapArenaInput = Readonly<{
  id?: string;
  bounds: ArenaMap['bounds'];
  houses: ArenaMap['houses'];
  physicalCover: ArenaMap['physicalCover'];
  shotSurfaces: ArenaMap['shotSurfaces'];
}>;

function minimapInput(arena: MinimapArenaInput, arenaId = arena.id ?? 'unknown') {
  return {
    arenaId,
    bounds: arena.bounds,
    width: 256,
    height: 256,
    houses: arena.houses,
    physicalCover: arena.physicalCover,
    surfaces: arena.shotSurfaces,
  };
}

describe('semantic minimap layer (HF-491)', () => {
  it('defaults props, decals and unknown surfaces to hidden', () => {
    expect(classifyMinimapSurface('nuketown2', {
      id: 'sign-1', name: 'nuketown2 sign planter debris decal',
      bounds: { minX: 0, maxX: 1, minZ: 0, maxZ: 1 },
    })).toBeNull();
    expect(classifyMinimapSurface('new-arena', {
      id: 'mystery', name: 'mystery prop',
      bounds: { minX: 0, maxX: 1, minZ: 0, maxZ: 1 },
    })).toBeNull();
  });

  it('snapshots the shared class table', () => {
    expect(MINIMAP_CLASS_TABLE.map(({ name, className, pattern }) => ({
      name,
      className,
      pattern: pattern.source,
    }))).toMatchInlineSnapshot(`
      [
        {
          "className": "vehicle",
          "name": "vehicle-body",
          "pattern": "\\b(?:vehicle|bus|coach|truck|car)\\s+(?:body|cab|box|hull)\\b",
        },
        {
          "className": "road",
          "name": "road-surface",
          "pattern": "\\b(?:road|asphalt|tarmac|carriageway|turning head)\\b|\\bstreet\\s+(?:asphalt|road|surface|turning|kerb)\\b",
        },
        {
          "className": "perimeter",
          "name": "perimeter",
          "pattern": "\\b(?:perimeter|compound|boundary)\\s+(?:wall|fence)\\b",
        },
        {
          "className": "garage",
          "name": "garage",
          "pattern": "\\bgarage\\s+(?:floor|roof|wall|link pier|front pier|back pier|door head)\\b",
        },
        {
          "className": "house",
          "name": "house-footprint",
          "pattern": "\\bhouse\\s+(?:floor|roof deck|wall|front pier|upper front pier|back pier|upper back pier)\\b",
        },
      ]
    `);
  });

  it('reduces Nuketown2 to the authored house/garage/perimeter/road/vehicle set', async () => {
    installHeadlessArenaShims();
    const factories = await loadArenaFactories();
    const arena = factories.nuketown2!.build(new THREE.Scene());
    const elements = buildMinimapStructuralElements(minimapInput(arena, 'nuketown2'));
    // Vehicles: coach, truck, HF-477's two street cars (dark saloon, green
    // classic - they replaced the single head car this set was first written
    // against) and the two driveway cars. HITL 5 integration.
    const macroSet = { house: 2, garage: 2, perimeter: 1, road: 1, vehicle: 6 } as const;
    const ceiling = Object.values(macroSet).reduce((total, count) => total + count, 0);
    expect(arena.colliders.length, 'before: every collider was a minimap rectangle').toBeGreaterThan(elements.length);
    expect(elements.length, 'after: only authored macro silhouettes remain').toBeLessThanOrEqual(ceiling);
    const counts = elements.reduce<Record<string, number>>((result, element) => ({
      ...result,
      [element.className]: (result[element.className] ?? 0) + 1,
    }), {});
    expect(counts).toEqual(macroSet);
    expect(MINIMAP_MIN_SEGMENT_PX).toBe(2);
  }, 300_000);

  it('does not increase any other arena minimap element count', async () => {
    installHeadlessArenaShims();
    const factories = await loadArenaFactories();
    for (const arenaId of ALL_ARENA_IDS) {
      if (arenaId === 'nuketown2') continue;
      const arena = factories[arenaId]!.build(new THREE.Scene());
      const after = buildMinimapStructuralElements(minimapInput(arena, arenaId)).length;
      // Before HF-491: Atomic used its house/cover list; all other arenas used
      // every static collider. This is measured from the built arena, not a
      // duplicated expected roster.
      const before = arenaId === 'atomic-acres'
        ? arena.houses.length + arena.physicalCover.length
        : arena.colliders.length;
      expect(after, `${arenaId}: semantic filter increased minimap elements`).toBeLessThanOrEqual(before);
    }
  }, 300_000);
});
