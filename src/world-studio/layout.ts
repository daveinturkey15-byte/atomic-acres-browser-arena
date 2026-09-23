import type { Box2 } from '../collision';

/** Compact playable interpretation of the owner concepts; distant courts are scenery. */
export const STUDIO_BOUNDS: Box2 = Object.freeze({ minX: -40, maxX: 40, minZ: -34, maxZ: 34 });
export const STUDIO_HOUSES = Object.freeze([
  { id: 'teal', x: -20, z: 0, facing: 1 },
  { id: 'yellow', x: 20, z: 0, facing: -1 },
] as const);
export const STUDIO_UPPER_Y = 3.3;
export const STUDIO_REVIEW_CAMERAS = Object.freeze([
  { id: 'street-hero', position: [0, 1.75, 25], target: [0, 3, -6] },
  { id: 'teal-front', position: [-8, 1.75, 15], target: [-20, 3, 0] },
  { id: 'yellow-front', position: [8, 1.75, 16], target: [20, 3, 0] },
  { id: 'teal-yard', position: [-36, 1.75, -20], target: [-24, 2.8, 0] },
  { id: 'yellow-yard', position: [36, 1.75, -20], target: [24, 2.8, 0] },
  { id: 'layout', position: [43, 72, 56], target: [0, 0, 0] },
] as const);

export function studioSpawnPositions(team: 0 | 1): Array<[number, number, number]> {
  const side = team === 0 ? -1 : 1;
  return [-28, -20, -12, -4, 4, 12, 20, 28].map((z, index) =>
    [side * (index % 2 === 0 ? 32 : 37), 1.78, z]);
}

export function studioRoadHalfWidth(z: number): number {
  return 8.7 + 2.8 * Math.exp(-(((z + 15) / 15) ** 2));
}
