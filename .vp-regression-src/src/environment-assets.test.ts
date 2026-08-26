import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { HOUSE_LAYOUT } from './arena-layout';
import {
  NEIGHBOURHOOD_BIN_POSITIONS,
  NEIGHBOURHOOD_FLOWER_BEDS,
  addNeighbourhoodLife,
  addSemanticHouseInteriors,
} from './environment-assets';
import { createHouseArchitecture } from './house-navigation';

const FLOWER_BED_RADIUS = 1;

function clearOfHouse(x: number, z: number, radius: number, house: ReturnType<typeof createHouseArchitecture>): boolean {
  const dx = Math.abs(x - house.origin.x);
  const dz = Math.abs(z - house.origin.z);
  return dx - radius > house.dimensions.width / 2 || dz - radius > house.dimensions.depth / 2;
}

describe('Pass 32 neighbourhood placement', () => {
  it('keeps Atomic fauna animation allocation-free inside the live update loop', () => {
    const source = readFileSync(new URL('./environment-assets.ts', import.meta.url), 'utf8');
    const update = source.slice(
      source.indexOf('export function updateArenaArt('),
      source.indexOf('/** Builds original Atomic Acres hero vehicles', source.indexOf('export function updateArenaArt(')),
    );
    expect(update).not.toContain('new THREE.');
    expect(update).not.toContain('.entries()');
    expect(update).toContain('arenaFlightMatrix.compose(');
  });

  it('keeps every flower bed fully outside both house footprints', () => {
    const houses = HOUSE_LAYOUT.map((house) => createHouseArchitecture(house.team, house.x, house.z, house.facing));
    for (const [flowerX, flowerZ] of NEIGHBOURHOOD_FLOWER_BEDS) {
      for (const house of houses) {
        expect(clearOfHouse(flowerX, flowerZ, FLOWER_BED_RADIUS, house), `flower bed ${flowerX},${flowerZ} overlaps ${house.id}`).toBe(true);
      }
    }
  });

  it('keeps exterior bins outside both house footprints and removes the low-quality bicycles', () => {
    const houses = HOUSE_LAYOUT.map((house) => createHouseArchitecture(house.team, house.x, house.z, house.facing));
    for (const [x, z] of NEIGHBOURHOOD_BIN_POSITIONS) {
      for (const house of houses) expect(clearOfHouse(x, z, 0.5, house), `bin ${x},${z} overlaps ${house.id}`).toBe(true);
    }
    const life = addNeighbourhoodLife(new THREE.Group(), false);
    expect(life.getObjectByName('street-bicycle')).toBeUndefined();
    expect(life.userData.neighbourhoodLife.bicycles).toBe(0);
  });
});

describe('Pass 59 interior grounding audit', () => {
  it('supports every elevated timber table and bed frame with grounded legs', () => {
    const root = new THREE.Group();
    addSemanticHouseInteriors(root);
    for (const houseIndex of [0, 1]) {
      for (const furniture of ['dining-table', 'bed-frame']) {
        const piece = root.getObjectByName(`performance-interior-${houseIndex}-${furniture}`)!;
        const supports = piece.userData.supportedBy as string[];
        expect(supports).toHaveLength(4);
        for (const supportName of supports) {
          const support = root.getObjectByName(supportName)!;
          expect(support, supportName).toBeTruthy();
          expect(support.userData.groundedAtY).toBe(furniture === 'dining-table' ? 0 : 3.48);
        }
      }
    }
  });

  it('keeps Performance kitchen and furniture presentation on canonical collision centres', () => {
    const root = new THREE.Group();
    addSemanticHouseInteriors(root);
    for (const [houseIndex, house] of HOUSE_LAYOUT.entries()) {
      const expected = [
        ['dining-table', 'dining', -3, -2.7],
        ['sofa-seat', 'sofa', 3.7, 2.7],
        ['kitchen-counter', 'kitchen', -3.75, -5.25],
        ['coffee-table', 'coffee-table', 3.4, 1.2],
        ['media-console', 'media', 3.7, -3.1],
        ['bed-frame', 'upper-bed', 6.1, -2.5],
        ['workstation-desk', 'upper-desk', -3.2, 2.8],
      ] as const;
      for (const [pieceName, colliderName, localX, localZ] of expected) {
        const piece = root.getObjectByName(`performance-interior-${houseIndex}-${pieceName}`)!;
        expect(piece, `${houseIndex}:${pieceName}`).toBeTruthy();
        expect(piece.position.x).toBeCloseTo(house.x + localX);
        expect(piece.position.z).toBeCloseTo(house.z + house.facing * localZ);
        expect(piece.userData.authoritativeCollider).toBe(`authored-house-${houseIndex}-${colliderName}-collider`);
      }
      const kitchenPieces = root.children[0]!.children.filter((piece) => piece.name.startsWith(`performance-interior-${houseIndex}-kitchen-`));
      expect(kitchenPieces.length).toBeGreaterThanOrEqual(8);
      const expectedColliderSet = new Set([
        `authored-house-${houseIndex}-dining-collider`,
        ...Array.from({ length: 4 }, (_, chairIndex) => `authored-house-${houseIndex}-chair-collider-${chairIndex}`),
        `authored-house-${houseIndex}-sofa-collider`,
        `authored-house-${houseIndex}-kitchen-collider`,
        `authored-house-${houseIndex}-coffee-table-collider`,
        `authored-house-${houseIndex}-media-collider`,
        `authored-house-${houseIndex}-upper-bed-collider`,
        `authored-house-${houseIndex}-upper-desk-collider`,
      ]);
      const presentedColliderSet = new Set<string>();
      root.traverse((piece) => {
        const collider = piece.userData.authoritativeCollider;
        if (typeof collider === 'string' && collider.startsWith(`authored-house-${houseIndex}-`)) presentedColliderSet.add(collider);
      });
      expect(presentedColliderSet).toEqual(expectedColliderSet);
    }
  });
});
