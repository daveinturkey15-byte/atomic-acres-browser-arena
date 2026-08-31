/**
 * THE APPLIED-TRANSFORM GATE.
 *
 * Owner, across several passes and again on 2026-08-31: "the gun clipping is
 * still happening everywhere". Every previous fix went green. The reason they
 * could is that every previous gate asserted on a pure REDUCER - the value
 * viewmodelObstructionPose() returns - while the renderer applied something
 * else entirely. Measured at HEAD with the eye 0.40 m from a wall:
 *
 *   reducer retreat .......... 0.780 m   (carbine) / 0.980 m (sniper)
 *   retreat the renderer did . 0.280 m             / 0.140 m
 *   muzzle past the wall ..... 0.889 m             / 0.937 m
 *
 * Note the sniper: the LONGER weapon travelled LESS, because a per-weapon
 * "authored near-plane contact retreat" was subtracted after a blanket 0.28 m
 * clamp. Both numbers were invisible to the unit suite.
 *
 * So this file asserts nothing a reducer returns. It builds a real
 * WeaponPresentation, drives update() to convergence, and then measures the
 * WORLD position of the mounted model's own `muzzle-socket` relative to the
 * camera. The number it checks is the number the owner sees:
 *
 *   penetration = dot(muzzleWorld - eye, cameraForward) - distanceToSurface
 *
 * and it must be <= 0.
 *
 * Live counterparts, installed Chrome, WebGPU, atomic-acres and test2:
 * docs/assets/viewmodel-clipping-fix-2026-08-31/.
 */
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import type { WeaponId } from './protocol';
import {
  HIP_VIEWMODEL_POSITION,
  VIEWMODEL_CONTACT_FOLD_MAXIMUM_PITCH_RADIANS,
  VIEWMODEL_NEAR_PLANE_CLEARANCE,
  WeaponPresentation,
  solveViewmodelContactFold,
  type ViewmodelRigBounds,
} from './weapon-presentation';
import { viewmodelObstructionPose, viewmodelSurfaceRetreat } from './weapon-presentation-state';
import { type WeaponPose } from './weapon-presentation';

const REST_POSE: WeaponPose = Object.freeze({
  dt: 1 / 60,
  moving: false,
  sprinting: false,
  crouched: false,
  prone: false,
  ads: false,
  phase: 0,
  landingImpulse: 0,
  lateralSpeed: 0,
  reloadProgress: null,
});

/** The failing case the owner reports: a wall 0.40 m from the eye. */
const WALL_DISTANCE_METERS = 0.4;
const CONTACT_WEAPONS: readonly WeaponId[] = ['carbine', 'sniper', 'lmg', 'scattergun', 'railgun', 'pistol'];

type Rig = {
  camera: THREE.PerspectiveCamera;
  presentation: WeaponPresentation;
};

async function mountedRig(weapon: WeaponId): Promise<Rig> {
  const camera = new THREE.PerspectiveCamera(75, 16 / 9, 0.05, 250);
  const presentation = new WeaponPresentation(camera, false);
  await presentation.load();
  // The runtime parents the viewmodel to the camera; camera space and the
  // root's parent space are then the same space, which is what every number
  // below is expressed in.
  camera.add(presentation.root);
  presentation.setWeapon(weapon, true);
  return { camera, presentation };
}

function settle(rig: Rig, pose: Partial<WeaponPose>, frames = 260): void {
  for (let frame = 0; frame < frames; frame += 1) rig.presentation.update({ ...REST_POSE, ...pose });
  rig.camera.updateMatrixWorld(true);
}

/**
 * The MOUNTED model, not merely the first one in the tree.
 *
 * The presentation keeps every weapon parented to the root and freezes the
 * matrices of the hidden ones, so `root.getObjectByName('muzzle-socket')`
 * answers with whichever model was added first and hands back a world position
 * frozen at load - which reads exactly like "the fold did nothing".
 */
function mountedModel(rig: Rig): THREE.Object3D {
  const mounted = rig.presentation.root.children.find(
    (child) => child.visible && child.getObjectByName('muzzle-socket') !== undefined,
  );
  expect(mounted, 'exactly one weapon model must be mounted and visible').toBeTruthy();
  mounted!.updateMatrixWorld(true);
  return mounted!;
}

/** Camera-forward metres to the mounted model's authored muzzle socket. */
function muzzleForwardMeters(rig: Rig): number {
  const socket = mountedModel(rig).getObjectByName('muzzle-socket');
  expect(socket, 'the mounted model must expose an authored muzzle socket').toBeTruthy();
  const local = rig.camera.worldToLocal(socket!.getWorldPosition(new THREE.Vector3()));
  return -local.z;
}

/** Camera-forward metres to the nearest point of any visible viewmodel mesh. */
function nearestRigForwardMeters(rig: Rig): number {
  let nearest = Number.POSITIVE_INFINITY;
  const corner = new THREE.Vector3();
  rig.presentation.root.updateMatrixWorld(true);
  mountedModel(rig);
  rig.presentation.root.traverse((node) => {
    if (!(node instanceof THREE.Mesh) || !node.visible) return;
    for (let parent: THREE.Object3D | null = node.parent; parent; parent = parent.parent) {
      if (parent === rig.presentation.root) break;
      if (!parent.visible) return;
    }
    const geometry = node.geometry as THREE.BufferGeometry;
    if (!geometry.boundingBox) geometry.computeBoundingBox();
    const box = geometry.boundingBox;
    if (!box) return;
    for (let index = 0; index < 8; index += 1) {
      corner.set(
        (index & 1) ? box.max.x : box.min.x,
        (index & 2) ? box.max.y : box.min.y,
        (index & 4) ? box.max.z : box.min.z,
      ).applyMatrix4(node.matrixWorld);
      nearest = Math.min(nearest, -rig.camera.worldToLocal(corner).z);
    }
  });
  return nearest;
}

describe('applied transform: the muzzle finishes behind the surface (owner 2026-08-31)', () => {
  for (const weapon of CONTACT_WEAPONS) {
    it(`${weapon} keeps its muzzle out of a wall 0.40 m from the eye`, async () => {
      const rig = await mountedRig(weapon);
      const envelope = rig.presentation.contactProbeEnvelope();
      expect(envelope, 'the rig must be measurable, or the fold has nothing to solve').not.toBeNull();

      // Establish the pre-contact reach. This is the whole reason retreat alone
      // cannot work: the muzzle starts metres in front of a wall 0.40 m away.
      settle(rig, {});
      const openReach = muzzleForwardMeters(rig);
      expect(openReach).toBeGreaterThan(WALL_DISTANCE_METERS);

      settle(rig, {
        surfaceRetreat: viewmodelSurfaceRetreat(WALL_DISTANCE_METERS, false, weapon),
        surfaceContactDepth: WALL_DISTANCE_METERS,
      });

      const muzzle = muzzleForwardMeters(rig);
      const penetration = muzzle - WALL_DISTANCE_METERS;
      expect(
        penetration,
        `${weapon}: muzzle ${muzzle.toFixed(3)} m vs surface ${WALL_DISTANCE_METERS} m`,
      ).toBeLessThanOrEqual(0);

      // And it must not have solved the wall by putting the rig in the camera.
      expect(nearestRigForwardMeters(rig)).toBeGreaterThanOrEqual(rig.camera.near);
    });
  }

  it('does not move the open-space pose at all - the fold is contact-only', async () => {
    const rig = await mountedRig('carbine');
    settle(rig, {});
    const openRoot = rig.presentation.root.position.clone();
    const openRotation = rig.presentation.root.rotation.x;
    const openScale = rig.presentation.root.scale.x;
    const openMuzzle = muzzleForwardMeters(rig);

    // Same frames again, with an explicit "nothing in range" contact depth.
    settle(rig, { surfaceContactDepth: null });
    expect(rig.presentation.root.position.z).toBeCloseTo(openRoot.z, 9);
    expect(rig.presentation.root.rotation.x).toBeCloseTo(openRotation, 9);
    expect(rig.presentation.root.scale.x).toBeCloseTo(openScale, 9);
    expect(muzzleForwardMeters(rig)).toBeCloseTo(openMuzzle, 9);
    expect(rig.presentation.contactFoldState().engaged).toBe(false);
    expect(rig.presentation.root.position.z)
      .toBeCloseTo(HIP_VIEWMODEL_POSITION.z - VIEWMODEL_NEAR_PLANE_CLEARANCE, 6);
  });

  it('reports the retreat the renderer performed, not the demand', async () => {
    const rig = await mountedRig('carbine');
    const demand = viewmodelSurfaceRetreat(WALL_DISTANCE_METERS, false, 'carbine');
    settle(rig, { surfaceRetreat: demand, surfaceContactDepth: WALL_DISTANCE_METERS });
    const state = rig.presentation.presentationState();
    expect(state.requestedSurfaceRetreat).toBe(demand);
    // THE GAP THAT HID FIVE DEFECTS: this used to be pinned at 0.28 m while the
    // demand was 0.78 m, and no test could tell. It is now the translation the
    // root actually performed, to the millimetre.
    const performed = (HIP_VIEWMODEL_POSITION.z - VIEWMODEL_NEAR_PLANE_CLEARANCE)
      - rig.presentation.root.position.z;
    expect(state.surfaceRetreat).toBeCloseTo(-performed, 2);
    expect(state.contactFold.engaged).toBe(true);
    expect(state.contactFold.residualMeters).toBeLessThanOrEqual(0.05);
  });

  it('leaves fire admission byte-identical while the fold is at full stretch', async () => {
    const rig = await mountedRig('carbine');
    const demand = viewmodelSurfaceRetreat(WALL_DISTANCE_METERS, false, 'carbine');
    settle(rig, { surfaceRetreat: demand, surfaceContactDepth: WALL_DISTANCE_METERS });
    const withFold = rig.presentation.presentationState();

    const control = await mountedRig('carbine');
    // The same retreat with NO measured contact depth: the fold cannot engage,
    // so any difference in admission would have to come from the fold.
    settle(control, { surfaceRetreat: demand, surfaceContactDepth: null });
    const withoutFold = control.presentation.presentationState();

    expect(withFold.contactFold.engaged).toBe(true);
    expect(withoutFold.contactFold.engaged).toBe(false);
    expect(withFold.fireAdmission).toEqual(withoutFold.fireAdmission);
    expect(withFold.contactResponse).toEqual(withoutFold.contactResponse);
  });
});

/**
 * The solve on its own, against rig bounds MEASURED in installed Chrome on
 * 2026-08-31. These are data, not estimates: they come out of
 * docs/assets/viewmodel-clipping-fix-2026-08-31/.
 */
describe('the contact fold solve, on measured rig bounds', () => {
  const MEASURED_CARBINE: ViewmodelRigBounds = Object.freeze({
    minX: -0.152, maxX: 0.128,
    minY: -0.43, maxY: 0.355,
    minZ: -0.894, maxZ: 0.713,
    muzzleX: -0.156, muzzleY: 0.118, muzzleZ: -0.88,
    hullYZ: Object.freeze([
      [-0.43, -0.179], [-0.43, -0.025], [-0.369, -0.65], [-0.15, -0.894],
      [0.12, 0.713], [0.147, 0.67], [0.355, 0.25], [0.355, -0.888],
    ] as const),
    meshes: 7,
  });

  const base = {
    bounds: MEASURED_CARBINE,
    baseRootZ: -1.14,
    authoredRootZ: -1.14 + 0.78,
    basePitchRadians: 0.82,
    baseScale: 0.734,
    nearPlaneMeters: 0.11,
  };

  it('closes a 1.96 m rig against a wall 0.40 m away', () => {
    const fold = solveViewmodelContactFold({ ...base, contactDepthMeters: WALL_DISTANCE_METERS });
    expect(fold.engaged).toBe(true);
    expect(fold.muzzleForwardMeters).toBeLessThanOrEqual(WALL_DISTANCE_METERS);
    expect(fold.foldPitchRadians).toBeGreaterThan(0);
    expect(base.basePitchRadians + fold.foldPitchRadians)
      .toBeLessThanOrEqual(VIEWMODEL_CONTACT_FOLD_MAXIMUM_PITCH_RADIANS + 1e-9);
  });

  it('never lets the rig cross the camera near plane to do it', () => {
    for (const depth of [0.2, 0.3, 0.4, 0.6, 0.9, 1.4, 2.2]) {
      const fold = solveViewmodelContactFold({ ...base, contactDepthMeters: depth });
      const rootZ = base.baseRootZ + fold.retreatMeters;
      expect(rootZ, `depth ${depth}`).toBeLessThanOrEqual(fold.nearPlaneLimitZ + 1e-9);
    }
  });

  it('graduates: a nearer surface never folds less than a further one', () => {
    let previousPitch = -1;
    let previousRetreat = -1;
    for (const depth of [3, 2.4, 1.8, 1.2, 0.8, 0.6, 0.4]) {
      const fold = solveViewmodelContactFold({ ...base, contactDepthMeters: depth });
      expect(fold.foldPitchRadians, `depth ${depth}`).toBeGreaterThanOrEqual(previousPitch - 1e-9);
      expect(fold.retreatMeters, `depth ${depth}`).toBeGreaterThanOrEqual(previousRetreat - 1e-9);
      previousPitch = fold.foldPitchRadians;
      previousRetreat = fold.retreatMeters;
    }
  });

  it('spends fold before it spends retreat', () => {
    // At this depth the authored retreat alone is more than enough, so the
    // solve must take only what the geometry needs and leave the rest - pulling
    // the whole rig at the camera is what drags the arms into the lens.
    const gentle = solveViewmodelContactFold({ ...base, contactDepthMeters: 1.6 });
    expect(gentle.muzzleForwardMeters).toBeLessThanOrEqual(1.6);
    expect(gentle.retreatMeters).toBeLessThan(0.78);
  });

  it('stays out of the way when there is nothing to solve', () => {
    expect(solveViewmodelContactFold({ ...base, contactDepthMeters: null }).engaged).toBe(false);
    expect(solveViewmodelContactFold({ ...base, bounds: null, contactDepthMeters: 0.4 }).engaged).toBe(false);
  });
});

describe('the reducer alone cannot answer this - which is why the gate is not on it', () => {
  it('the pure obstruction pose reports a retreat the renderer may not be able to perform', () => {
    const pose = viewmodelObstructionPose(0.26, false, null, 'carbine');
    expect(pose.retreat).toBeCloseTo(0.78, 6);
    // 0.78 m of pure translation would leave a 1.96 m muzzle 1.18 m in front of
    // the eye, which is 0.78 m through a wall at 0.40 m. The reducer is right
    // about the demand and says nothing at all about the result.
    expect(pose.contactDepthMeters).toBeNull();
  });
});
