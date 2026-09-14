import { describe, expect, it } from 'vitest';
import type { Box2, Point3 } from '../collision';
import {
  VIEWMODEL_SURFACE_CLIP_BIAS_METERS,
  VIEWMODEL_SURFACE_CLIP_BOTTOM_FACE_MINIMUM_RISE_METERS,
  VIEWMODEL_SURFACE_CLIP_EYE_CLEARANCE_FRACTION,
  VIEWMODEL_SURFACE_CLIP_GROUND_MINIMUM_DROP_METERS,
  VIEWMODEL_SURFACE_CLIP_GROUND_REACH_METERS,
  VIEWMODEL_SURFACE_CLIP_PLANE_COUNT,
  VIEWMODEL_SURFACE_CLIP_REACH_METERS,
  VIEWMODEL_SURFACE_CLIP_TOP_FACE_MINIMUM_DEPTH_METERS,
  separatingFaceFor,
  viewmodelSurfaceClipAppliedBias,
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

  it('has its own minimum drop, not the box-top constant it used to borrow', () => {
    // REVIEW REPAIR (HF-395). The ground gate used
    // VIEWMODEL_SURFACE_CLIP_TOP_FACE_MINIMUM_DEPTH_METERS (0.5 m), a number
    // measured for BOX TOPS beside the rig. It is the wrong question for the
    // standing surface: a box top level with the rig is not a separating face,
    // while the floor is a fixed world height that cuts exactly what is under
    // it however low the eye gets. Measured prone eye is 0.762 m above its
    // floor, so the borrowed 0.5 m left only 0.26 m before a landing dip, view
    // bob or camera shake silently DROPPED the floor plane for those frames.
    expect(VIEWMODEL_SURFACE_CLIP_GROUND_MINIMUM_DROP_METERS)
      .toBeLessThan(VIEWMODEL_SURFACE_CLIP_TOP_FACE_MINIMUM_DEPTH_METERS);
    // A dip to 0.45 m - inside the old gate's dead zone - now keeps its floor.
    const dipped = viewmodelSurfaceClipPlanes({ eye: { x: 0, y: 0.45, z: 0 }, colliders: [], groundPlaneY: 0 });
    expect(dipped, 'the floor plane survives a landing dip').toHaveLength(1);
    expect(dipped[0]!.normal).toEqual({ x: 0, y: 1, z: 0 });
    // ...and it still cuts under the floor rather than through the rig.
    expect(signedDistance(dipped[0]!, { x: 0, y: -0.05, z: 0 })).toBeLessThan(0);
    expect(signedDistance(dipped[0]!, { x: 0, y: 0.2, z: 0 })).toBeGreaterThan(0);
  });

  it('ignores a ground reference the eye has all but reached', () => {
    // Below the minimum drop the reference is level with the eye and stale:
    // a plane there is describing a floor the player is no longer above.
    expect(viewmodelSurfaceClipPlanes({
      eye: { x: 0, y: VIEWMODEL_SURFACE_CLIP_GROUND_MINIMUM_DROP_METERS - 0.02, z: 0 },
      colliders: [],
      groundPlaneY: 0,
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

describe('no returned plane may ever cut the eye - the rig-erasure guard', () => {
  // REVIEW REPAIR (HF-395, 2026-09-02). The measured failure this exists for:
  // 72 of 327 poses in the after-run reported clippedVertices 15577 of 15577 -
  // the ENTIRE viewmodel discarded. The instrument cannot tell that apart from
  // a perfect clip: a rig that is not drawn at all reports 0 m penetration and
  // 0 m below the floor. Nearly every vertex of the rig sits within a metre of
  // the eye, so the cheap sufficient condition is that the eye itself is always
  // strictly on the kept side of every plane, with clearance.

  it('applies the full bias when there is room and never more than half the clearance', () => {
    expect(viewmodelSurfaceClipAppliedBias(1)).toBeCloseTo(VIEWMODEL_SURFACE_CLIP_BIAS_METERS, 9);
    expect(viewmodelSurfaceClipAppliedBias(0.5)).toBeCloseTo(VIEWMODEL_SURFACE_CLIP_BIAS_METERS, 9);
    // Below twice the bias the clamp takes over, in proportion.
    expect(viewmodelSurfaceClipAppliedBias(0.005))
      .toBeCloseTo(0.005 * VIEWMODEL_SURFACE_CLIP_EYE_CLEARANCE_FRACTION, 9);
    expect(viewmodelSurfaceClipAppliedBias(0)).toBe(0);
  });

  it('keeps the eye when a wall is closer to it than the z-fight bias', () => {
    // THE DEFECT, stated as geometry. The eye is 5 mm outside the wall's face;
    // an unclamped 12 mm bias put the plane 7 mm PAST the eye, so the kept
    // half-space contained neither the eye nor any of the rig hanging round it.
    const brushing: Box2 = { minX: 0.005, maxX: 0.4, minZ: -20, maxZ: 20, minY: 0, maxY: 3 };
    const plane = separatingFaceFor(brushing, EYE)!;
    expect(plane.normal).toEqual({ x: -1, y: 0, z: 0 });
    expect(signedDistance(plane, EYE), 'the eye is on the kept side').toBeGreaterThan(0);
    // ...and the plane still sits between the eye and the wall face, so the
    // geometry genuinely inside the wall is still cut.
    expect(signedDistance(plane, { x: 0.2, y: 1.7, z: 0 })).toBeLessThan(0);
  });

  it('holds the eye clearance for every face, at every approach distance', () => {
    for (const gap of [0.0001, 0.001, 0.005, 0.011, 0.012, 0.013, 0.05, 0.3, 1.0]) {
      for (const box of [
        { minX: gap, maxX: gap + 0.3, minZ: -20, maxZ: 20, minY: 0, maxY: 3 },
        { minX: -20, maxX: -gap, minZ: -20, maxZ: 20, minY: 0, maxY: 3 },
        { minX: -20, maxX: 20, minZ: gap, maxZ: gap + 0.3, minY: 0, maxY: 3 },
        { minX: -20, maxX: 20, minZ: -20, maxZ: -gap, minY: 0, maxY: 3 },
      ] as Box2[]) {
        const eye: Point3 = { x: 0, y: 1.7, z: 0 };
        const plane = separatingFaceFor(box, eye);
        if (!plane) continue;
        expect(signedDistance(plane, eye), `gap ${gap} m, normal ${normalKey(plane)}`)
          .toBeGreaterThanOrEqual(plane.eyeDistanceMeters * VIEWMODEL_SURFACE_CLIP_EYE_CLEARANCE_FRACTION - 1e-12);
      }
    }
  });

  it('keeps a ball around the eye whatever the frame throws at it', () => {
    // Deterministic pseudo-random boxes: the point is coverage of the plane
    // SET, including opposed normals that could otherwise empty the frame.
    let seed = 20260902;
    const random = (): number => {
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      return seed / 4294967296;
    };
    const eye: Point3 = { x: 0, y: 1.7, z: 0 };
    for (let trial = 0; trial < 400; trial += 1) {
      const colliders: Box2[] = Array.from({ length: 1 + Math.floor(random() * 6) }, () => {
        const cx = (random() - 0.5) * 3;
        const cz = (random() - 0.5) * 3;
        const cy = random() * 3;
        return {
          minX: cx, maxX: cx + 0.1 + random(),
          minZ: cz, maxZ: cz + 0.1 + random(),
          minY: cy, maxY: cy + 0.1 + random() * 2,
        };
      });
      const groundPlaneY = random() < 0.5 ? (random() * 2.4) : null;
      const planes = viewmodelSurfaceClipPlanes({ eye, colliders, groundPlaneY });
      expect(planes.length).toBeLessThanOrEqual(VIEWMODEL_SURFACE_CLIP_PLANE_COUNT);
      let smallest = Number.POSITIVE_INFINITY;
      for (const plane of planes) {
        const distance = signedDistance(plane, eye);
        expect(distance, `trial ${trial}: a plane cut the eye`).toBeGreaterThan(0);
        smallest = Math.min(smallest, distance);
      }
      // The eye survives with clearance, so a ball of that radius round it
      // survives too: the frame is never empty at the camera.
      if (planes.length > 0) expect(smallest).toBeGreaterThan(0);
    }
  });
});
