import { describe, expect, it } from 'vitest';
import { HOUSE_LAYOUT } from './arena-layout';
import { NEIGHBOURHOOD_FLOWER_BEDS } from './environment-assets';
import { createHouseArchitecture } from './house-navigation';

const FLOWER_BED_RADIUS = 1;

describe('Pass 32 neighbourhood placement', () => {
  it('keeps every flower bed fully outside both house footprints', () => {
    const houses = HOUSE_LAYOUT.map((house) => createHouseArchitecture(house.team, house.x, house.z, house.facing));
    for (const [flowerX, flowerZ] of NEIGHBOURHOOD_FLOWER_BEDS) {
      for (const house of houses) {
        const dx = Math.abs(flowerX - house.origin.x);
        const dz = Math.abs(flowerZ - house.origin.z);
        const clearOfHouse = dx - FLOWER_BED_RADIUS > house.dimensions.width / 2
          || dz - FLOWER_BED_RADIUS > house.dimensions.depth / 2;
        expect(clearOfHouse, `flower bed ${flowerX},${flowerZ} overlaps ${house.id}`).toBe(true);
      }
    }
  });
});
