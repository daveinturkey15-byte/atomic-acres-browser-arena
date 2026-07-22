export const ARENA_BOUNDS = Object.freeze({ minX: -34, maxX: 34, minZ: -43, maxZ: 43 });

export const HOUSE_LAYOUT = Object.freeze([
  Object.freeze({ team: 0 as const, x: -9, z: -28, facing: 1 as const }),
  Object.freeze({ team: 1 as const, x: 9, z: 28, facing: -1 as const }),
]);

export const GARAGE_LAYOUT = Object.freeze([
  Object.freeze({ x: 12, z: -36.5 }),
  Object.freeze({ x: -12, z: 36.5 }),
]);

export const COVER_LAYOUT: ReadonlyArray<readonly [number, number, number, number]> = Object.freeze([
  [-13, -11, 3.5, 2], [13, 11, 3.5, 2], [-15, 4, 3, 3], [15, -4, 3, 3],
  [-21, 17, 4, 2], [21, -17, 4, 2], [-24, -4, 3, 5], [24, 4, 3, 5],
]);

export const SPAWN_LAYOUT = Object.freeze({
  0: Object.freeze([
    [-20, -30], [-24, -30], [-27, -22], [-21, -18],
    [3, -40], [3, -34], [4, -27], [6, -20],
    [22, -39], [27, -33], [24, -26], [28, -24],
  ] as const),
  1: Object.freeze([
    [6, 38], [24, 30], [27, 22], [21, 18],
    [-3, 40], [-3, 34], [-4, 27], [-6, 20],
    [-22, 39], [-27, 33], [-24, 26], [-28, 24],
  ] as const),
});

export const PATROL_LAYOUT: ReadonlyArray<readonly [number, number]> = Object.freeze([
  [-22, -10], [-16, 13], [-4, 20], [7, 13],
  [19, 7], [17, -15], [2, -20], [-11, -15],
]);
