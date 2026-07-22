import { describe, expect, it } from 'vitest';
import { HOUSE_LAYOUT } from './arena-layout';
import {
  NEIGHBOURHOOD_BICYCLE_POSITIONS,
  NEIGHBOURHOOD_BIN_POSITIONS,
  NEIGHBOURHOOD_FLOWER_BEDS,
} from './environment-assets';
import { createHouseArchitecture } from './house-navigation';

const FLOWER_BED_RADIUS = 1;

function clearOfHouse(x: number, z: number, radius: number, house: ReturnType<typeof createHouseArchitecture>): boolean {
  const dx = Math.abs(x - house.origin.x);
  const dz = Math.abs(z - house.origin.z);
  return dx - radius > house.dimensions.width / 2 || dz - radius > house.dimensions.depth / 2;
}

describe('Pass 32 neighbourhood placement', () => {
  it('keeps every flower bed fully outside both house footprints', () => {
    const houses = HOUSE_LAYOUT.map((house) => createHouseArchitecture(house.team, house.x, house.z, house.facing));
    for (const [flowerX, flowerZ] of NEIGHBOURHOOD_FLOWER_BEDS) {
      for (const house of houses) {
        expect(clearOfHouse(flowerX, flowerZ, FLOWER_BED_RADIUS, house), `flower bed ${flowerX},${flowerZ} overlaps ${house.id}`).toBe(true);
      }
    }
  });

  it('keeps exterior bins and bicycles outside both house footprints', () => {
    const houses = HOUSE_LAYOUT.map((house) => createHouseArchitecture(house.team, house.x, house.z, house.facing));
    for (const [x, z] of NEIGHBOURHOOD_BIN_POSITIONS) {
      for (const house of houses) expect(clearOfHouse(x, z, 0.5, house), `bin ${x},${z} overlaps ${house.id}`).toBe(true);
    }
    for (const [x, z] of NEIGHBOURHOOD_BICYCLE_POSITIONS) {
      for (const house of houses) expect(clearOfHouse(x, z, 1, house), `bicycle ${x},${z} overlaps ${house.id}`).toBe(true);
    }
  });
});
