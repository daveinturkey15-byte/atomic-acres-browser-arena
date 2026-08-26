import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  FIRST_PERSON_ARM_AUTHORED_MAX_CARRIAGE_METERS,
  FIRST_PERSON_ARM_AUTHORED_MAX_POLE_RADIANS,
  FIRST_PERSON_ARM_AUTHORED_MAX_WRIST_ROLL_RADIANS,
  buildFirstPersonArmAuthoredPoseLayer,
  firstPersonArmAuthoredLayerSample,
  type FirstPersonArmChainJoints,
} from './operator-model';
import { FIRST_PERSON_ARM_MOTION_MAX_POLE_RADIANS } from './weapon-presentation';

/**
 * Bent bind geometry so the elbow-pole decomposition is well conditioned.
 * The bend MUST leave the swing plane: every clip below swings about Z in the
 * XY plane, so an in-plane wrist offset (x only) keeps both projected elbow
 * directions collinear with the shoulder->wrist axis and the pole angle reads
 * exactly zero no matter how the upper arm moves - measured before this
 * offset existed (the fixture looked bent but decomposed nothing). A z
 * offset gives the perpendicular plane real area and the pole a signal,
 * matching the loaded authored rig whose elbows bend out of plane.
 */
function chainJoints(): FirstPersonArmChainJoints[] {
  const joints: FirstPersonArmChainJoints[] = [];
  for (const [side, suffix] of [['left', 'L'], ['right', 'R']] as const) {
    const shoulder = new THREE.Bone();
    shoulder.name = `UpperArm${suffix}`;
    const elbow = new THREE.Bone();
    elbow.name = `LowerArm${suffix}`;
    const wrist = new THREE.Bone();
    wrist.name = `Wrist${suffix}`;
    elbow.position.set(0, -0.3, 0);
    wrist.position.set(0.05, -0.276, 0.04);
    shoulder.add(elbow);
    elbow.add(wrist);
    joints.push({ side, shoulder, elbow, wrist });
  }
  return joints;
}

function rotationClip(
  name: string,
  tracks: ReadonlyArray<{ name: string; radians: number; axis: THREE.Vector3 }>,
): THREE.AnimationClip {
  const q = new THREE.Quaternion();
  const written = tracks.map((track) => {
    q.setFromAxisAngle(track.axis, track.radians);
    return new THREE.QuaternionKeyframeTrack(track.name, [0, 1], [
      q.x, q.y, q.z, q.w, q.x, q.y, q.z, q.w,
    ]);
  });
  return new THREE.AnimationClip(name, 1, written);
}

describe('HF-388 authored first-person arm pose layer', () => {
  it('decomposes a bind-equal clip to zero channels', () => {
    const layer = buildFirstPersonArmAuthoredPoseLayer([rotationClip('idle', [])], chainJoints());
    const pose = layer.get('idle');
    expect(pose).toBeDefined();
    expect(pose?.left.poleRadians).toBe(0);
    expect(pose?.left.wristRollRadians).toBe(0);
    expect(pose?.left.carriageOffset).toEqual([0, 0, 0]);
    expect(pose?.right.poleRadians).toBe(0);
  });

  it('measures the authored upper-arm swing as carriage and pole before clamping', () => {
    // UpperArmR swung 0.2 rad about Z moves the whole straight-ish chain; the
    // wrist displacement is analytically (0.11344, 0.02142, 0) for this geometry.
    const layer = buildFirstPersonArmAuthoredPoseLayer([
      rotationClip('swing', [{ name: 'UpperArmR.quaternion', radians: 0.2, axis: new THREE.Vector3(0, 0, 1) }]),
    ], chainJoints());
    const right = layer.get('swing')?.right;
    expect(right).toBeDefined();
    expect(right?.carriageOffset[0]).toBeCloseTo(0.11344, 3);
    expect(right?.carriageOffset[1]).toBeCloseTo(0.02142, 3);
    expect(Math.abs(right?.poleRadians ?? 99)).toBeGreaterThan(0.01);
  });

  it('reads a wrist twist as wrist roll', () => {
    const layer = buildFirstPersonArmAuthoredPoseLayer([
      rotationClip('twist', [{ name: 'WristR.quaternion', radians: 0.3, axis: new THREE.Vector3(0, 1, 0) }]),
    ], chainJoints());
    // The forearm axis points mostly down -Y, so a +Y twist reads negative.
    expect(layer.get('twist')?.right.wristRollRadians).toBeLessThan(-0.2);
  });

  it('clamps sampled channels to the pinned procedural motion caps', () => {
    const joints = chainJoints();
    const big = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), 0.9);
    const layer = buildFirstPersonArmAuthoredPoseLayer([
      new THREE.AnimationClip('huge', 1, [
        new THREE.QuaternionKeyframeTrack('UpperArmR.quaternion', [0, 1], [big.x, big.y, big.z, big.w, big.x, big.y, big.z, big.w]),
        new THREE.QuaternionKeyframeTrack('WristR.quaternion', [0, 1], [big.x, big.y, big.z, big.w, big.x, big.y, big.z, big.w]),
      ]),
    ], joints);
    const sample = firstPersonArmAuthoredLayerSample(layer, null, 'huge');
    expect(sample.right.poleRadians).toBeLessThanOrEqual(FIRST_PERSON_ARM_AUTHORED_MAX_POLE_RADIANS + 1e-9);
    expect(sample.right.poleRadians).toBeGreaterThanOrEqual(-FIRST_PERSON_ARM_AUTHORED_MAX_POLE_RADIANS - 1e-9);
    expect(sample.right.wristRollRadians).toBeLessThanOrEqual(FIRST_PERSON_ARM_AUTHORED_MAX_WRIST_ROLL_RADIANS + 1e-9);
    const magnitude = Math.hypot(...sample.right.carriageOffset);
    expect(magnitude).toBeLessThanOrEqual(FIRST_PERSON_ARM_AUTHORED_MAX_CARRIAGE_METERS + 1e-9);
    // The authored pole bound must never exceed the procedural pole bound it
    // shares a clamp with in solveRiggedArms.
    expect(FIRST_PERSON_ARM_AUTHORED_MAX_POLE_RADIANS).toBeLessThanOrEqual(FIRST_PERSON_ARM_MOTION_MAX_POLE_RADIANS);
  });

  it('the active one-shot overrides the looping base and unknown names fall back to zero', () => {
    const joints = chainJoints();
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), 0.05);
    const values = [q.x, q.y, q.z, q.w, q.x, q.y, q.z, q.w];
    const layer = buildFirstPersonArmAuthoredPoseLayer([
      new THREE.AnimationClip('idle', 1, []),
      new THREE.AnimationClip('reload', 1, [
        new THREE.QuaternionKeyframeTrack('UpperArmL.quaternion', [0, 1], values),
      ]),
    ], joints);
    const baseOnly = firstPersonArmAuthoredLayerSample(layer, 'idle', null);
    expect(baseOnly.left.poleRadians).toBe(0);
    const oneShot = firstPersonArmAuthoredLayerSample(layer, 'idle', 'reload');
    expect(oneShot.left.poleRadians).not.toBe(0);
    const unknown = firstPersonArmAuthoredLayerSample(layer, 'nope', 'also-nope');
    expect(unknown.left.poleRadians).toBe(0);
    expect(firstPersonArmAuthoredLayerSample(null, 'idle', null).right.poleRadians).toBe(0);
  });

  it('is wired into the live viewmodel: equip on switch, ADS edges, carriage in the solve', () => {
    // Source contract, same pattern as operator-stance-presentation.test.ts:
    // green unit tests mean nothing unless the live update path calls it.
    const source = readFileSync(new URL('./weapon-presentation.ts', import.meta.url), 'utf8');
    expect(source).toContain("playFirstPersonArmAction(this.authoredArmsRoot, 'equip')");
    expect(source).toContain("playFirstPersonArmAction(this.authoredArmsRoot, presentedAds ? 'ads-in' : 'ads-out')");
    expect(source).toContain('this.applyRiggedArmCarriage(rig, cameraRotation)');
  });
});
