import { describe, expect, it } from 'vitest';
import type { Box2, Point3 } from '../collision';
import {
  VIEWMODEL_SURFACE_CLIP_BIAS_METERS,
  VIEWMODEL_SURFACE_CLIP_PLANE_COUNT,
  separatingFaceFor,
  viewmodelSurfaceClipPlanes,
} from './viewmodel-surface-clip';

/** Signed distance of a point from a plane; positive is the KEPT side. */
function signedDistance(plane: { normal: Point3; constant: number }, point: Point3): number {
  return plane.normal.x * point.x + plane.normal.y * point.y + plane.normal.z * point.z + plane.constant;
}

const EYE: Point3 = { x: 0, y: 1.7, z: 0 };

/** A wall running north-south, 0.5 m to the player's RIGHT (+X). */
const WALL_TO_THE_RIGHT: Box2 = { minX: 0.5, maxX: 0.8, minZ: -20, maxZ: 20, minY: 0, maxY: 3 };
/** A wall the player is facing, 0.5 m ahead (-Z is forward at yaw 0). */
const WALL_AHEAD: Box2 = { minX: -20, maxX: 20, minZ: -0.8, maxZ: -0.5, minY: 0, maxY: 3 };
const FLOOR: Box2 = { minX: -20, maxX: 20, minZ: -20, maxZ: 20, minY: -1, maxY: 0 };

describe('the separating face of a solid', () => {
  it('picks the face that stands between the eye and the solid', () => {
    const plane = separatingFaceFor(WALL_TO_THE_RIGHT, EYE);
    expect(plane).not.toBeNull();
    // The wall is to the +X side, so its -X face is what separates it from the eye.
    expect(plane!.normal).toEqual({ x: -1, y: 0, z: 0 });
    expect(plane!.eyeDistanceMeters).toBeCloseTo(0.5, 6);
  });

  it('keeps the eye on the kept side and the far side of the wall cut', () => {
    const plane = separatingFaceFor(WALL_TO_THE_RIGHT, EYE)!;
    expect(signedDistance(plane, EYE)).toBeGreaterThan(0);
    // A point inside the wall must be cut.
    expect(signedDistance(plane, { x: 0.65, y: 1.7, z: 0 })).toBeLessThan(0);
    // A point just short of the wall must survive.
    expect(signedDistance(plane, { x: 0.4, y: 1.7, z: 0 })).toBeGreaterThan(0);
  });

  it('biases the cut out of the solid so the rig does not z-fight the wall', () => {
    const plane = separatingFaceFor(WALL_TO_THE_RIGHT, EYE)!;
    // A point exactly on the wall face is already cut, by the bias.
    const onTheFace = { x: WALL_TO_THE_RIGHT.minX, y: 1.7, z: 0 };
    expect(signedDistance(plane, onTheFace)).toBeCloseTo(-VIEWMODEL_SURFACE_CLIP_BIAS_METERS, 6);
  });

  it('treats a floor as the same computation with a vertical normal', () => {
    const plane = separatingFaceFor(FLOOR, EYE)!;
    expect(plane.normal).toEqual({ x: 0, y: 1, z: 0 });
    // Below the floor top is cut; above it survives.
    expect(signedDistance(plane, { x: 0, y: -0.2, z: 0 })).toBeLessThan(0);
    expect(signedDistance(plane, { x: 0, y: 0.2, z: 0 })).toBeGreaterThan(0);
  });

  it('chooses the NEAREST separating face, which is the one the rig can reach', () => {
    // Standing beside a long wall, near its end but still within its extent:
    // the end caps are not separating faces at all, so the side face wins.
    const plane = separatingFaceFor(WALL_TO_THE_RIGHT, { x: 0, y: 1.7, z: 19.5 })!;
    expect(plane.normal).toEqual({ x: -1, y: 0, z: 0 });
  });

  it("does not slice open air by picking a wall segment end cap", () => {
    // THE BUG THIS RULE WAS GOT WRONG ON FIRST. One segment of a long wall,
    // beside the player: the eye is 3 m past the segment's z extent but only
    // 0.5 m from its side. Taking the face the eye is furthest outside of picks
    // the end cap, whose plane cuts straight across the corridor the player is
    // walking down.
    const segment: Box2 = { minX: 0.5, maxX: 0.8, minZ: -4, maxZ: -3, minY: 0, maxY: 3 };
    const plane = separatingFaceFor(segment, EYE)!;
    expect(plane.normal, 'the side face, not the end cap').toEqual({ x: -1, y: 0, z: 0 });
    expect(plane.eyeDistanceMeters).toBeCloseTo(0.5, 6);
  });

  it('refuses to clip against a solid the eye is inside', () => {
    expect(separatingFaceFor(WALL_TO_THE_RIGHT, { x: 0.65, y: 1.5, z: 0 })).toBeNull();
  });

  it('skips oriented boxes rather than guessing a face', () => {
    expect(separatingFaceFor({ ...WALL_TO_THE_RIGHT, rotation: [0, 0.6, 0] }, EYE)).toBeNull();
  });
});

describe('selecting the frame\'s surface clip planes', () => {
  it('finds the wall alongside the player - the case the camera-perpendicular plane could not', () => {
    const planes = viewmodelSurfaceClipPlanes({ eye: EYE, colliders: [WALL_TO_THE_RIGHT] });
    expect(planes).toHaveLength(1);
    expect(planes[0]!.normal).toEqual({ x: -1, y: 0, z: 0 });
  });

  it('ignores solids the rig cannot reach', () => {
    const faraway: Box2 = { minX: 40, maxX: 41, minZ: -20, maxZ: 20, minY: 0, maxY: 3 };
    expect(viewmodelSurfaceClipPlanes({ eye: EYE, colliders: [faraway] })).toHaveLength(0);
  });

  it('leaves the floor alone when the rig cannot reach it', () => {
    // Standing, the eye is 1.7 m above the ground and the rig reaches ~0.9 m, so
    // the floor is not a surface it can be inside. Spending a slot on it would
    // take one away from a wall that CAN cut the rig. This mirrors the geometry
    // finding that a standing player's weapon cannot reach flat ground at all.
    const planes = viewmodelSurfaceClipPlanes({
      eye: EYE, colliders: [WALL_TO_THE_RIGHT, WALL_AHEAD, FLOOR],
    });
    expect(planes.map((plane) => `${plane.normal.x},${plane.normal.y},${plane.normal.z}`).sort())
      .toEqual(['-1,0,0', '0,0,1']);
  });

  it('handles an inside corner plus its floor at once when prone', () => {
    // Prone, the eye drops to 0.61 m and the floor IS in reach - which is the
    // stance the original floor clamp was written for.
    const prone: Point3 = { x: 0, y: 0.61, z: 0 };
    const planes = viewmodelSurfaceClipPlanes({
      eye: prone,
      colliders: [WALL_TO_THE_RIGHT, WALL_AHEAD, FLOOR],
    });
    expect(planes.length).toBe(3);
    const normals = planes.map((plane) => `${plane.normal.x},${plane.normal.y},${plane.normal.z}`).sort();
    expect(normals).toEqual(['-1,0,0', '0,0,1', '0,1,0']);
    // Every plane must keep the eye.
    for (const plane of planes) expect(signedDistance(plane, prone)).toBeGreaterThan(0);
  });

  it('does not spend all three slots on one wall split into segments', () => {
    // A long wall authored as many collider boxes shares one face plane.
    const segments: Box2[] = Array.from({ length: 8 }, (_unused, index) => ({
      minX: 0.5, maxX: 0.8, minZ: -4 + index, maxZ: -3 + index, minY: 0, maxY: 3,
    }));
    const planes = viewmodelSurfaceClipPlanes({ eye: EYE, colliders: segments });
    expect(planes, 'coplanar faces are one surface, not eight').toHaveLength(1);
  });

  it('never returns more planes than the fixed slot count', () => {
    // More distinct surfaces than slots: the array length is what holds the
    // shader permutation constant, so exceeding it would recompile the rig.
    const many: Box2[] = [
      WALL_TO_THE_RIGHT,
      WALL_AHEAD,
      FLOOR,
      { minX: -0.8, maxX: -0.5, minZ: -20, maxZ: 20, minY: 0, maxY: 3 },
      { minX: -20, maxX: 20, minZ: 0.5, maxZ: 0.8, minY: 0, maxY: 3 },
      { minX: -20, maxX: 20, minZ: -20, maxZ: 20, minY: 2.4, maxY: 3 },
    ];
    const planes = viewmodelSurfaceClipPlanes({ eye: EYE, colliders: many });
    expect(planes.length).toBeLessThanOrEqual(VIEWMODEL_SURFACE_CLIP_PLANE_COUNT);
  });

  it('prefers the nearest surfaces when there are more than slots', () => {
    const near: Box2 = { minX: 0.3, maxX: 0.4, minZ: -20, maxZ: 20, minY: 0, maxY: 3 };
    const far: Box2 = { minX: -20, maxX: 20, minZ: -1.3, maxZ: -1.2, minY: 0, maxY: 3 };
    const planes = viewmodelSurfaceClipPlanes({
      eye: EYE, colliders: [far, near, FLOOR], maximumPlanes: 1,
    });
    expect(planes).toHaveLength(1);
    expect(planes[0]!.eyeDistanceMeters).toBeCloseTo(0.3, 6);
  });

  it('reads dressing boxes as well as colliders', () => {
    const planes = viewmodelSurfaceClipPlanes({
      eye: EYE, colliders: [], dressingBoxes: [WALL_TO_THE_RIGHT],
    });
    expect(planes).toHaveLength(1);
  });
});

describe('the ground plane, which no collider box can describe', () => {
  it('cuts geometry below the standing surface', () => {
    // The owner's reported case: sloped grass, looking down. Terrain is a
    // raycast surface, not a box, so before this the arena measured zero box
    // penetrations and 36 poses with weapon geometry below the ground.
    const planes = viewmodelSurfaceClipPlanes({
      eye: { x: 0, y: 0.61, z: 0 }, colliders: [], groundPlaneY: 0,
    });
    expect(planes).toHaveLength(1);
    expect(planes[0]!.normal).toEqual({ x: 0, y: 1, z: 0 });
    expect(signedDistance(planes[0]!, { x: 0, y: -0.2, z: 0 })).toBeLessThan(0);
    expect(signedDistance(planes[0]!, { x: 0, y: 0.3, z: 0 })).toBeGreaterThan(0);
  });

  it('ignores a stale ground reference the player is now below', () => {
    // Walked down a stairwell: a plane at the old floor would cut the whole rig.
    expect(viewmodelSurfaceClipPlanes({
      eye: { x: 0, y: 0.4, z: 0 }, colliders: [], groundPlaneY: 4,
    })).toHaveLength(0);
  });

  it('ignores ground too far below to reach', () => {
    expect(viewmodelSurfaceClipPlanes({
      eye: EYE, colliders: [], groundPlaneY: 0,
    }), 'standing, the floor is 1.7 m down and out of the rig’s reach').toHaveLength(0);
  });

  it('never drops the ground when walls compete for the slots', () => {
    const prone: Point3 = { x: 0, y: 0.61, z: 0 };
    const walls: Box2[] = [
      { minX: 0.2, maxX: 0.4, minZ: -20, maxZ: 20, minY: 0, maxY: 3 },
      { minX: -0.4, maxX: -0.2, minZ: -20, maxZ: 20, minY: 0, maxY: 3 },
      { minX: -20, maxX: 20, minZ: -0.4, maxZ: -0.2, minY: 0, maxY: 3 },
      { minX: -20, maxX: 20, minZ: 0.2, maxZ: 0.4, minY: 0, maxY: 3 },
    ];
    const planes = viewmodelSurfaceClipPlanes({ eye: prone, colliders: walls, groundPlaneY: 0 });
    expect(planes.length).toBe(VIEWMODEL_SURFACE_CLIP_PLANE_COUNT);
    expect(planes.some((plane) => plane.normal.y === 1), 'the floor survives the cull').toBe(true);
  });
});
