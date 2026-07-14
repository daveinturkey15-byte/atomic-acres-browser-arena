export type HouseSolid = {
  name: 'interior-divider' | 'upper-floor' | 'interior-stair' | 'rear-deck'
    | 'house-ground-side' | 'house-ground-wall' | 'door-lintel'
    | 'house-upper-side' | 'upper-wall-left' | 'upper-wall-centre' | 'upper-wall-right';
  position: [number, number, number];
  size: [number, number, number];
};

/** Collidable exterior shell. Decorative trim, glass and roof pieces remain visual-only. */
export function houseShellSolids(x: number, z: number, facing: 1 | -1): HouseSolid[] {
  const frontZ = z + facing * 7.2;
  const backZ = z - facing * 7.2;
  const solids: HouseSolid[] = [
    { name: 'house-ground-side', position: [x - 8.1, 1.65, z], size: [0.45, 3.3, 14.8] },
    { name: 'house-ground-side', position: [x + 8.1, 1.65, z], size: [0.45, 3.3, 14.8] },
    { name: 'house-upper-side', position: [x - 8.1, 5.45, z], size: [0.45, 3.65, 14.8] },
    { name: 'house-upper-side', position: [x + 8.1, 5.45, z], size: [0.45, 3.65, 14.8] },
  ];
  for (const wallZ of [frontZ, backZ]) {
    solids.push(
      { name: 'house-ground-wall', position: [x - 5.2, 1.65, wallZ], size: [5.8, 3.3, 0.45] },
      { name: 'house-ground-wall', position: [x + 5.2, 1.65, wallZ], size: [5.8, 3.3, 0.45] },
      { name: 'door-lintel', position: [x, 3.02, wallZ], size: [4.55, 0.56, 0.45] },
      { name: 'upper-wall-left', position: [x - 6.3, 5.45, wallZ], size: [3.6, 3.65, 0.45] },
      { name: 'upper-wall-centre', position: [x, 5.45, wallZ], size: [3.4, 3.65, 0.45] },
      { name: 'upper-wall-right', position: [x + 6.3, 5.45, wallZ], size: [3.6, 3.65, 0.45] },
    );
  }
  return solids;
}

/**
 * Authoritative interior solids shared by rendering, Rapier collision and route tests.
 * The stair hall intentionally has no z-crossing divider on its right side.
 */
export function houseInteriorSolids(x: number, z: number, facing: 1 | -1): HouseSolid[] {
  const solids: HouseSolid[] = [
    // A partial cross-wall creates two readable rooms while leaving a 5.9 m
    // central/stair hall. The old right segment intersected the stair flight.
    { name: 'interior-divider', position: [x - 5.1, 1.55, z], size: [6, 3.1, 0.25] },
    { name: 'upper-floor', position: [x - 4.9, 3.48, z], size: [6.2, 0.3, 13.7] },
    // The stairwell opens early enough for the standing capsule's head clearance;
    // a short landing bridges the final tread into the front upper room.
    { name: 'upper-floor', position: [x + 4.9, 3.48, z + facing * 5.3], size: [6.2, 0.3, 4.2] },
    { name: 'upper-floor', position: [x + 4.9, 3.48, z - facing * 5.3], size: [6.2, 0.3, 4.2] },
    // Front bridge connects the stair-side landing to the opposite upstairs
    // room while preserving the central stairwell opening behind it.
    { name: 'upper-floor', position: [x, 3.48, z + facing * 5.3], size: [3.6, 0.3, 4.2] },
    { name: 'upper-floor', position: [x + 4.85, 3.48, z + facing * 2.85], size: [2.5, 0.3, 1.5] },
    // Keep the rear threshold within the verified 0.42 m autostep envelope.
    { name: 'rear-deck', position: [x, 0.18, z - facing * 9.2], size: [10, 0.36, 3.5] },
  ];
  for (let step = 0; step < 10; step += 1) {
    const height = 0.34 * (step + 1);
    solids.push({
      name: 'interior-stair',
      position: [x + 4.85, height / 2, z - facing * 3.45 + facing * step * 0.62],
      size: [2.5, height, 0.66],
    });
  }
  return solids;
}

export function houseCollisionSolids(x: number, z: number, facing: 1 | -1): HouseSolid[] {
  return [...houseShellSolids(x, z, facing), ...houseInteriorSolids(x, z, facing)];
}

export function solidBounds(solid: HouseSolid): { minX: number; maxX: number; minZ: number; maxZ: number; minY: number; maxY: number } {
  return {
    minX: solid.position[0] - solid.size[0] / 2,
    maxX: solid.position[0] + solid.size[0] / 2,
    minY: solid.position[1] - solid.size[1] / 2,
    maxY: solid.position[1] + solid.size[1] / 2,
    minZ: solid.position[2] - solid.size[2] / 2,
    maxZ: solid.position[2] + solid.size[2] / 2,
  };
}
