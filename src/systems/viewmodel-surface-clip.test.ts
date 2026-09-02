import { describe, expect, it } from 'vitest';
import type { Box2, Point3 } from '../collision';
import {
  VIEWMODEL_SURFACE_CLIP_BIAS_METERS,
  VIEWMODEL_SURFACE_CLIP_BOTTOM_FACE_MINIMUM_RISE_METERS,
  VIEWMODEL_SURFACE_CLIP_GROUND_REACH_METERS,
  VIEWMODEL_SURFACE_CLIP_PLANE_COUNT,
  VIEWMODEL_SURFACE_CLIP_REACH_METERS,
  VIEWMODEL_SURFACE_CLIP_TOP_FACE_MINIMUM_DEPTH_METERS,
  separatingFaceFor,
  viewmodelSurfaceClipPlanes,
} from './viewmodel-surface-clip';

/** Signed distance of a point from a plane; positive is the KEPT side. */
function signedDistance(plane: { normal: Point3; constant: number }, point: Point3): number {
  return plane.normal.x * point.x + plane.normal.y * point.y + plane.normal.z * point.z + plane.constant;
}

const normalKey = (plane: { normal: Point3 }): string => `${plane.normal.x},${plane.normal.y},${plane.normal.z}`;

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

  it('does not take a top face that is level with the rig - the garage-door frame emptier', () => {
    // HF-395, measured at the Nuke Town garage door (eye 1.84 m up): a
    // dressing box whose top sat at 1.75 m, with the eye inside its footprint,
    // offered its TOP as the only separating face. A plane 0.08 m under the
    // eye keeps the scope and cuts everything else - 13838 of 15538 rig
    // vertices gone. That face is beside the rig, not under it.
    const doorBox: Box2 = { minX: 17.66, maxX: 18.34, minZ: -6.32, maxZ: -5.68, minY: 0.185, maxY: 1.75 };
    const eye: Point3 = { x: 17.7, y: 1.84, z: -6.2 };
    expect(separatingFaceFor(doorBox, eye), 'no side face is available, so no plane').toBeNull();
    // Beside the same box its SIDE is the separating face, never its top.
    const beside = separatingFaceFor(doorBox, { x: 17.5, y: 1.84, z: -6.2 })!;
    expect(beside.normal).toEqual({ x: -1, y: 0, z: 0 });
    // A top face the rig's own hang below the eye is genuinely under the rig.
    const table: Box2 = { minX: -1, maxX: 1, minZ: -1, maxZ: 1, minY: 0, maxY: 1.84 - VIEWMODEL_SURFACE_CLIP_TOP_FACE_MINIMUM_DEPTH_METERS };
    expect(separatingFaceFor(table, { x: 0, y: 1.84, z: 0 })!.normal).toEqual({ x: 0, y: 1, z: 0 });
  });

  it('does not take a ceiling that is level with the optic', () => {
    const lowCeiling: Box2 = { minX: -1, maxX: 1, minZ: -1, maxZ: 1, minY: 1.7 + VIEWMODEL_SURFACE_CLIP_BOTTOM_FACE_MINIMUM_RISE_METERS - 0.01, maxY: 3 };
    expect(separatingFaceFor(lowCeiling, EYE)).toBeNull();
    const ceiling: Box2 = { ...lowCeiling, minY: 1.7 + VIEWMODEL_SURFACE_CLIP_BOTTOM_FACE_MINIMUM_RISE_METERS + 0.01 };
    expect(separatingFaceFor(ceiling, EYE)!.normal).toEqual({ x: 0, y: -1, z: 0 });
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

  it('leaves a floor BOX alone beyond the wall reach when standing - the tracked ground covers it', () => {
    // A floor authored as a collider box 1.7 m under a standing eye is beyond
    // the 1.4 m wall reach, and stays out of the box selection. That is not a
    // claim that a standing rig cannot reach the floor - HF-395 measured the
    // arms sleeve 0.49 m below flat ground, standing, looking down
    // (artifacts/qa/hf395/before-rows.json, open-ground-down/stand) - it is
    // that the FLOOR is delivered by `groundPlaneY` with its own longer reach,
    // see 'holds in every stance' below.
    const planes = viewmodelSurfaceClipPlanes({
      eye: EYE, colliders: [WALL_TO_THE_RIGHT, WALL_AHEAD, FLOOR],
    });
    expect(planes.map(normalKey).sort()).toEqual(['-1,0,0', '0,0,1']);
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
    expect(planes.map(normalKey).sort()).toEqual(['-1,0,0', '0,0,1', '0,1,0']);
    // Every plane must keep the eye.
    for (const plane of planes) expect(signedDistance(plane, prone)).toBeGreaterThan(0);
  });

  it('does not spend slots on one wall split into segments', () => {
    // A long wall authored as many collider boxes shares one face plane.
    const segments: Box2[] = Array.from({ length: 8 }, (_unused, index) => ({
      minX: 0.5, maxX: 0.8, minZ: -4 + index, maxZ: -3 + index, minY: 0, maxY: 3,
    }));
    const planes = viewmodelSurfaceClipPlanes({ eye: EYE, colliders: segments });
    expect(planes, 'coplanar faces are one surface, not eight').toHaveLength(1);
  });

  it('keeps one plane per normal - the nearer of two nested half-spaces is the only one that cuts', () => {
    // HF-395, measured in the Nuke Town bus/van gap: two ceilings 0.03 m
    // apart each took a slot, and the wall the rig was actually inside was
    // dropped. A vertex the nearer ceiling keeps is kept by the farther one
    // too, so the farther one can never cut anything on its own.
    const ceilingA: Box2 = { minX: -20, maxX: 20, minZ: -20, maxZ: 20, minY: 2.1, maxY: 2.3 };
    const ceilingB: Box2 = { minX: -20, maxX: 20, minZ: -20, maxZ: 20, minY: 2.13, maxY: 2.3 };
    const planes = viewmodelSurfaceClipPlanes({ eye: EYE, colliders: [ceilingB, ceilingA] });
    expect(planes).toHaveLength(1);
    expect(planes[0]!.eyeDistanceMeters).toBeCloseTo(2.1 - 1.7, 6);
    // The same family rule joins the ground with any box top: nearest wins.
    // Prone (eye 0.75 m up) on a 0.2 m step: the step's top is the +Y plane.
    const step: Box2 = { minX: -20, maxX: 20, minZ: -20, maxZ: 20, minY: 0, maxY: 0.2 };
    const withGround = viewmodelSurfaceClipPlanes({ eye: { x: 0, y: 0.75, z: 0 }, colliders: [step], groundPlaneY: 0 });
    expect(withGround).toHaveLength(1);
    expect(withGround[0]!.eyeDistanceMeters).toBeCloseTo(0.55, 6);
  });

  it('has a slot for every axis-aligned normal, so no reachable surface is ever dropped', () => {
    expect(VIEWMODEL_SURFACE_CLIP_PLANE_COUNT).toBe(6);
    const prone: Point3 = { x: 0, y: 0.61, z: 0 };
    const allSix: Box2[] = [
      { minX: 0.3, maxX: 0.6, minZ: -20, maxZ: 20, minY: 0, maxY: 3 },
      { minX: -0.6, maxX: -0.3, minZ: -20, maxZ: 20, minY: 0, maxY: 3 },
      { minX: -20, maxX: 20, minZ: -0.6, maxZ: -0.3, minY: 0, maxY: 3 },
      { minX: -20, maxX: 20, minZ: 0.3, maxZ: 0.6, minY: 0, maxY: 3 },
      { minX: -20, maxX: 20, minZ: -20, maxZ: 20, minY: 1.2, maxY: 3 },
      FLOOR,
    ];
    const planes = viewmodelSurfaceClipPlanes({ eye: prone, colliders: allSix });
    expect(planes.map(normalKey).sort()).toEqual(['-1,0,0', '0,-1,0', '0,0,-1', '0,0,1', '0,1,0', '1,0,0']);
    expect(planes.length).toBeLessThanOrEqual(VIEWMODEL_SURFACE_CLIP_PLANE_COUNT);
    for (const plane of planes) expect(signedDistance(plane, prone)).toBeGreaterThan(0);
  });

  it('prefers the nearest surfaces when a caller asks for fewer slots than normals', () => {
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

  it('respects the wall reach for boxes and the longer ground reach for the floor', () => {
    expect(VIEWMODEL_SURFACE_CLIP_GROUND_REACH_METERS).toBeGreaterThan(VIEWMODEL_SURFACE_CLIP_REACH_METERS);
    const tall: Point3 = { x: 0, y: 2.0, z: 0 };
    // A floor BOX 2 m down is beyond the wall reach and gets no plane...
    expect(viewmodelSurfaceClipPlanes({ eye: tall, colliders: [FLOOR] })).toHaveLength(0);
    // ...while the tracked standing surface at the same depth still does.
    expect(viewmodelSurfaceClipPlanes({ eye: tall, colliders: [], groundPlaneY: 0 })).toHaveLength(1);
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

  it('holds in every stance: prone, crouch and standing eyes all get the floor', () => {
    // HF-395: the pass 81 instrument never measured a real stance (it sampled
    // airborne at eye height 1.8 m), so "the floor plane holds prone" was
    // never checked against a standing eye. Stance eye heights are 0.61, 1.16
    // and 1.7 m above the feet, plus the camera's ~0.14 m seat.
    for (const eyeHeight of [0.75, 1.3, 1.84]) {
      const planes = viewmodelSurfaceClipPlanes({
        eye: { x: 0, y: eyeHeight, z: 0 }, colliders: [], groundPlaneY: 0,
      });
      expect(planes, `eye ${eyeHeight} m above the floor`).toHaveLength(1);
      expect(planes[0]!.normal.y).toBe(1);
    }
  });

  it('ignores a stale ground reference the player is now below', () => {
    // Walked down a stairwell: a plane at the old floor would cut the whole rig.
    expect(viewmodelSurfaceClipPlanes({
      eye: { x: 0, y: 0.4, z: 0 }, colliders: [], groundPlaneY: 4,
    })).toHaveLength(0);
  });

  it('ignores a ground reference level with the rig', () => {
    // Mid-jump the eye can be within the rig's own hang of the last floor; a
    // plane there would cut the weapon's underside in open air.
    expect(viewmodelSurfaceClipPlanes({
      eye: { x: 0, y: VIEWMODEL_SURFACE_CLIP_TOP_FACE_MINIMUM_DEPTH_METERS - 0.05, z: 0 }, colliders: [], groundPlaneY: 0,
    })).toHaveLength(0);
  });

  it('ignores ground too far below to reach', () => {
    expect(viewmodelSurfaceClipPlanes({
      eye: { x: 0, y: VIEWMODEL_SURFACE_CLIP_GROUND_REACH_METERS + 0.3, z: 0 }, colliders: [], groundPlaneY: 0,
    }), 'a storey up, the floor is out of even the pitched rig’s reach').toHaveLength(0);
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
    // Four walls and the floor: five distinct normals, all kept.
    expect(planes.length).toBe(5);
    expect(planes.some((plane) => plane.normal.y === 1), 'the floor survives the cull').toBe(true);
  });
});
