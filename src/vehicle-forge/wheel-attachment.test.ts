/**
 * wheel-attachment.test.ts - W1: every wheel is rigidly attached to its body.
 *
 * Owner R006/HF-536: "the wheels on our car are not even on our car, they are
 * not physically attached, a buggy implementation."
 *
 * Contract: wheel centres are a pure function of the vehicle spec (body-local,
 * vehicle frame: nose z=0, ground y=0). Placing the body at any world
 * transform (position + yaw, exactly what mergeForgedPlacements bakes) must
 * move every wheel with it, so each centre recovered to body-local space is
 * invariant. The geometry the builder emits must agree with the query: every
 * reported centre sits inside real tyre geometry.
 */
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  applyForgedPlacement,
  buildForgedVehicle,
  buildForgedWheelSet,
  createForgeMaterialSet,
  forgedVehicleWheelCentres,
  forgedWheelSetCentres,
  stripForgedPlacement,
} from './build';
import { archLowerEdge } from './geometry';
import { COACH_SPEC, SEDAN_SPEC, TRUCK_CAB_SPEC } from './specs';
import type { VehicleSpec } from './geometry';

/** Four body world transforms: translate, rotate, both, plus identity. */
const PLACEMENTS = Object.freeze([
  { x: 0, z: 0, yaw: 0 },
  { x: 8.5, z: -3.25, yaw: 0 },
  { x: -6, z: 9, yaw: Math.PI / 2 },
  { x: 4.2, z: -7.8, yaw: -Math.PI / 2 + 0.35 },
]);

/** Independent world mapping via three.js itself (not the helpers). */
function threeWorld(x: number, y: number, z: number, place: { x: number; z: number; yaw: number }): THREE.Vector3 {
  const m = new THREE.Matrix4().makeRotationY(place.yaw).setPosition(place.x, 0, place.z);
  return new THREE.Vector3(x, y, z).applyMatrix4(m);
}

function checkCentreSet(
  label: string,
  centres: readonly { x: number; y: number; z: number }[],
  expected: ReadonlyArray<readonly [number, number, number]>,
): void {
  expect(centres.length, `${label} wheel count`).toBe(expected.length);
  for (const [ex, ey, ez] of expected) {
    expect(
      centres.some((c) => Math.abs(c.x - ex) < 1e-9 && Math.abs(c.y - ey) < 1e-9 && Math.abs(c.z - ez) < 1e-9),
      `${label} misses body-local centre (${ex}, ${ey}, ${ez})`,
    ).toBe(true);
  }
}

/** Every reported centre must sit inside emitted tyre geometry (group-local). */
function expectCentresInsideTyres(label: string, group: THREE.Group, centres: readonly { x: number; y: number; z: number }[], radius: number): void {
  const tyre = group.children.find((c) => c instanceof THREE.Mesh && c.name.endsWith(' tyre')) as THREE.Mesh | undefined;
  expect(tyre, `${label} has a tyre-bucket mesh`).toBeDefined();
  const pos = tyre!.geometry.getAttribute('position') as THREE.BufferAttribute;
  const v = new THREE.Vector3();
  for (const c of centres) {
    let best = Infinity;
    for (let i = 0; i < pos.count; i += 1) {
      v.fromBufferAttribute(pos, i);
      const d = Math.hypot(v.x - c.x, v.y - c.y, v.z - c.z);
      if (d < best) best = d;
    }
    expect(best, `${label} centre (${c.x.toFixed(2)}, ${c.y.toFixed(2)}, ${c.z.toFixed(2)}) far from tyre geometry`).toBeLessThan(radius);
  }
}

function expectInvariantAcrossPlacements(label: string, centres: readonly { x: number; y: number; z: number }[]): void {
  for (const place of PLACEMENTS) {
    for (const c of centres) {
      const world = applyForgedPlacement(c, place.x, place.z, place.yaw);
      // Independent path agrees: the helper's yaw convention matches three.js.
      const ref = threeWorld(c.x, c.y, c.z, place);
      expect(Math.hypot(world.x - ref.x, world.y - ref.y, world.z - ref.z), `${label} helper vs three.js at (${place.x}, ${place.z}, ${place.yaw.toFixed(3)})`).toBeLessThan(1e-9);
      // Round trip: the wheel comes back to exactly its body-local centre.
      const back = stripForgedPlacement(world, place.x, place.z, place.yaw);
      expect(Math.hypot(back.x - c.x, back.y - c.y, back.z - c.z), `${label} body-local drift at (${place.x}, ${place.z}, ${place.yaw.toFixed(3)})`).toBeLessThan(1e-9);
    }
  }
}

describe('W1 wheel-to-body attachment', () => {
  const cases: ReadonlyArray<{ label: string; spec: VehicleSpec; extra?: readonly number[] }> = [
    { label: 'coach', spec: COACH_SPEC },
    { label: 'truck-cab', spec: TRUCK_CAB_SPEC },
    { label: 'sedan', spec: SEDAN_SPEC },
  ];
  for (const { label, spec, extra } of cases) {
    it(`${label}: centres are the spec axles in the body frame and never drift`, () => {
      const centres = forgedVehicleWheelCentres(spec, extra);
      const axles = [...spec.wheelZ, ...(extra ?? [])];
      const expected: Array<readonly [number, number, number]> = [];
      for (const z of axles) for (const s of [1, -1] as const) expected.push([s * spec.trackHalfWidth, spec.wheelRadius, z] as const);
      checkCentreSet(label, centres, expected);
      const built = buildForgedVehicle(spec, { wheelStyle: 'cover' }, createForgeMaterialSet(0x8a2f2b, `w1-${label}`));
      expectCentresInsideTyres(label, built.group, centres, spec.wheelRadius);
      expectInvariantAcrossPlacements(label, centres);
    });

    it(`${label}: tyre crown meets its arch (no float, no burial)`, () => {
      for (const z of spec.wheelZ) {
        const crown = archLowerEdge(spec, z);
        // Arch crown clears the tyre crown by exactly the authored gap.
        expect(crown, `${label} arch crown over axle ${z}`).toBeCloseTo(2 * spec.wheelRadius + spec.archGap, 9);
      }
    });
  }

  it('truck-bogie: caller-supplied axles stay in the cab frame across placements', () => {
    // The HF-536 defect: these numbers were written as world-x arithmetic with
    // the truck origin dropped, landing both axles ahead of the nose. They are
    // cab-frame z now (cabLength - 1.0, cabLength + boxLength - 1.1); pin the
    // frame convention that broke: yaw -PI/2 maps vehicle z to worldX = x - z.
    const centres = forgedWheelSetCentres(0.42, 1.06, [4.2, 10.6]);
    checkCentreSet('truck-bogie', centres, [
      [1.06, 0.42, 4.2], [-1.06, 0.42, 4.2], [1.06, 0.42, 10.6], [-1.06, 0.42, 10.6],
    ]);
    const built = buildForgedWheelSet('w1-truck-bogie', 0.42, 0.16, 1.06, [4.2, 10.6], 'steel', createForgeMaterialSet(0xd8d8d8, 'w1-bogie'));
    expectCentresInsideTyres('truck-bogie', built.group, centres, 0.42);
    expectInvariantAcrossPlacements('truck-bogie', centres);
    const nose = { x: 11.5625, z: 2.4, yaw: -Math.PI / 2 };
    const world = applyForgedPlacement({ x: 0, y: 0.42, z: 4.2 }, nose.x, nose.z, nose.yaw);
    expect(world.x, 'bogie axle reaches world as nose - z').toBeCloseTo(nose.x - 4.2, 9);
  });
});
