/**
 * MAP3 (HF-409): what a showcase corridor publishes so an arena can COLLIDE it.
 *
 * WHY THIS EXISTS.
 *
 * `src/map3/**` was written for a standalone page with no player authority at
 * all: you fly a camera through it. Every corridor therefore publishes geometry
 * and an `update()` and nothing solid, which is the first of the three reasons
 * the showcase was kept out of the game arena - AGENTS.md requires that "every
 * substantial player-reachable visible object must have matching movement and
 * shot authority", and dropping a forest, a sea, a colonnade and a stadium into
 * an arena root with no colliders would put a whole map of ghost cover in front
 * of the player.
 *
 * A corridor is the only place that knows where its solids ARE. The forest's
 * trunks come out of a Poisson scatter, the colonnade's columns out of a bay
 * loop, the ruin's walls out of a shape grammar; all of that is generated, and
 * none of it is recoverable from the merged mesh afterwards (a corridor's
 * "wood" is ONE merged mesh spanning 60 m, so its bounding box is the corridor,
 * not a tree). So each corridor declares its solids AT THE POINT IT PLACES
 * THEM, in its own local frame, and the arena transforms them into world
 * colliders and shot surfaces.
 *
 * COORDINATES. Corridor-local, exactly like the corridor's own geometry: +x is
 * lateral, -z runs away from the hub, y is up from the corridor floor plane.
 * The arena rotates a corridor by a MULTIPLE OF 90 DEGREES only, so a local
 * axis-aligned box stays axis-aligned in world space and the collider rectangle
 * the arena records is the solid's true world footprint. (Anything yawed off an
 * axis measures as an inflated AABB and reads to the parity audit as an
 * invisible collider - the failure that made the first Map 3 arena square.)
 *
 * WHAT IS AND IS NOT A SOLID. A solid is something a body cannot walk through
 * and a bullet must hit: a trunk, a plinth, a pier pile, a wall, a column, a
 * parapet. Leaves, grass, rain, splash rings, water surfaces, litter and the
 * self-driving truck are NOT solids - they are presentation, and the repo's
 * parity rules already classify them that way. Nothing here exists to quieten a
 * gate: a solid that is declared and not really there is an invisible collider,
 * and the audit will say so.
 */

/** Ballistic material ids the corridors' solids use. Mirrors BallisticMaterialId. */
export type CorridorSolidMaterial = 'wood' | 'stone' | 'glass' | 'metal';

export type CorridorSolid = Readonly<{
  /**
   * Honest name for the thing. The arena prefixes it with the corridor id and
   * uses it for the collider's name, so a parity finding says `map3-nature-trunk`
   * and not `(unnamed Mesh)`.
   */
  name: string;
  /** Centre, corridor-local metres. */
  x: number;
  y: number;
  z: number;
  /** Full extents, corridor-local metres. */
  sx: number;
  sy: number;
  sz: number;
  material: CorridorSolidMaterial;
}>;

/** A vertical cylinder-ish solid (trunk, column, pile) as its inscribed box. */
export function uprightSolid(
  name: string,
  x: number,
  z: number,
  radius: number,
  height: number,
  material: CorridorSolidMaterial,
  baseY = 0,
): CorridorSolid {
  // A trunk's collider is the square that INSCRIBES nothing and CIRCUMSCRIBES
  // the bole: a player brushing a 0.3 m trunk should stop at the bark, not
  // 5 cm inside it, and a square of side 2r is the cheapest honest shape the
  // Box2 collider format can carry. Height is clamped to the standing volume
  // plus a head: nothing above 3 m blocks a body, and a 12 m collider on a
  // 12 m tree would explain nothing that a 3 m one does not.
  const side = Math.max(0.24, radius * 2);
  const solidHeight = Math.max(0.9, Math.min(height, 3.2));
  return {
    name,
    x,
    y: baseY + solidHeight / 2,
    z,
    sx: side,
    sy: solidHeight,
    sz: side,
    material,
  };
}

/**
 * A merged cluster (a grammar tower, a village block, a ruin wall) as one solid.
 *
 * The cluster's own geometry bounds ARE its footprint, and they are measured
 * BEFORE the yaw the corridor gives it, on purpose: a rotated box's AABB is
 * bigger than the box, and a collider built from one is an invisible wall
 * around a building - the exact defect that made the first Map 3 arena
 * abandon a radial plan. A yaw that is a multiple of 90 degrees is exact, so
 * it is applied as an axis swap; any other yaw is dropped and the collider
 * stays the building's true footprint, square to the corridor. The residual is
 * at most a corner of a near-square tower and always INSIDE the visible mass.
 */
export function clusterSolid(
  name: string,
  bounds: { min: { x: number; y: number; z: number }; max: { x: number; y: number; z: number } },
  x: number,
  z: number,
  yaw: number,
  material: CorridorSolidMaterial,
): CorridorSolid {
  const width = bounds.max.x - bounds.min.x;
  const depth = bounds.max.z - bounds.min.z;
  const height = bounds.max.y - bounds.min.y;
  const cx = (bounds.min.x + bounds.max.x) / 2;
  const cz = (bounds.min.z + bounds.max.z) / 2;
  const quarter = Math.round(yaw / (Math.PI / 2));
  const exact = Math.abs(yaw - quarter * (Math.PI / 2)) < 0.09;  // ~5 degrees
  const swapped = exact && Math.abs(quarter) % 2 === 1;
  const cos = exact ? Math.round(Math.cos(quarter * (Math.PI / 2))) : 1;
  const sin = exact ? Math.round(Math.sin(quarter * (Math.PI / 2))) : 0;
  return {
    name,
    x: x + cx * cos + cz * sin,
    y: (bounds.min.y + bounds.max.y) / 2,
    z: z - cx * sin + cz * cos,
    sx: swapped ? depth : width,
    sy: height,
    sz: swapped ? width : depth,
    material,
  };
}
