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
 * geometry in world space, relative to the camera.
 *
 * THE METRIC IS CORRECTED, AND THAT IS THE POINT OF THIS REVISION.
 *
 * The previous revision of this file measured the mounted model's authored
 * `muzzle-socket` and graded on that. It closed that number - worst muzzle
 * penetration went +1.087 m to -0.041 m over 68 live rows - and the owner
 * still saw the gun through the wall, because a socket is a single authored
 * point and the player sees the SILHOUETTE. The harness's own data said so at
 * the time: with the surface at 0.400 m the carbine's muzzle finished at
 * 0.351 m while its magazine finished at 0.572 m and its arms at 0.791 m.
 *
 *   penetration = max(over every VISIBLE viewmodel mesh:
 *                     furthest-forward vertex along cameraForward)
 *               - distanceToSurface
 *
 * and it must be <= 0. A gate that measures a single socket is how this
 * shipped twice; the argument for asserting on the applied transform was
 * right, the metric was not.
 *
 * Live counterparts, installed Chrome, WebGPU, atomic-acres and test2:
 * docs/assets/viewmodel-clipping-fix-2026-08-31/.
 */
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import type { WeaponId } from './protocol';
import {
  HIP_VIEWMODEL_POSITION,
  VIEWMODEL_CONTACT_CLIP_MARGIN_METERS,
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

type RigExtent = Readonly<{ nearest: number; furthest: number; furthestPart: string }>;

/**
 * Camera-forward span of every VISIBLE viewmodel mesh, measured on REAL
 * VERTICES - weapon, arms, sleeves, gloves, optic, magazine, everything the
 * player can see. `furthest` is the number the owner's complaint is about.
 *
 * Vertices, not the eight corners of `geometry.boundingBox`, and the
 * difference is not academic. The live rig's arms are SkinnedMeshes, so their
 * bounding box is the BIND-POSE box: measured in installed Chrome it reads
 * 1.21 m further forward than any real vertex in the open pose, and 0.07 m
 * SHORT of the real vertices in the folded wall pose. It over-reports where it
 * would cost travel and under-reports where the failure actually is.
 */
function rigExtent(rig: Rig): RigExtent {
  let nearest = Number.POSITIVE_INFINITY;
  let furthest = Number.NEGATIVE_INFINITY;
  let furthestPart = '';
  const vertex = new THREE.Vector3();
  rig.presentation.root.updateMatrixWorld(true);
  mountedModel(rig);
  rig.presentation.root.traverse((node) => {
    if (!(node instanceof THREE.Mesh) || !node.visible) return;
    for (let parent: THREE.Object3D | null = node.parent; parent; parent = parent.parent) {
      if (parent === rig.presentation.root) break;
      if (!parent.visible) return;
    }
    const position = (node.geometry as THREE.BufferGeometry).getAttribute('position');
    if (!position) return;
    const skinned = node instanceof THREE.SkinnedMesh;
    for (let index = 0; index < position.count; index += 1) {
      vertex.fromBufferAttribute(position, index);
      if (skinned) (node as THREE.SkinnedMesh).applyBoneTransform(index, vertex);
      vertex.applyMatrix4(node.matrixWorld);
      const forward = -rig.camera.worldToLocal(vertex).z;
      if (forward < nearest) nearest = forward;
      if (forward > furthest) { furthest = forward; furthestPart = node.name || node.type; }
    }
  });
  return { nearest, furthest, furthestPart };
}

/**
 * What actually reaches the screen: the rig, cut at the contacting surface.
 *
 * The cut is not a way of passing the test by measuring what was cut away. It
 * is the FALLBACK the diagnosis identified, and it is here because the rig
 * physically cannot fold far enough - the forward-most point is bounded below
 * by `nearPlane + rigDepth`, which at the owner's 0.40 m leaves 0.23 m for a
 * chain whose shoulder entry alone sits 0.69 m from the eye. `foldClosesTheWeapon`
 * below pins how much the fold does on its own, so this number cannot quietly
 * become the whole answer.
 */
function visibleForwardMeters(rig: Rig): number {
  const extent = rigExtent(rig);
  const cut = rig.presentation.contactFoldState().clipPlaneDistanceMeters;
  if (cut === null) return extent.furthest;
  return Math.min(extent.furthest, cut - VIEWMODEL_CONTACT_CLIP_MARGIN_METERS);
}

describe('applied transform: no VISIBLE geometry finishes past the surface (owner 2026-08-31)', () => {
  for (const weapon of CONTACT_WEAPONS) {
    it(`${weapon} keeps its whole silhouette out of a wall 0.40 m from the eye`, async () => {
      const rig = await mountedRig(weapon);
      const envelope = rig.presentation.contactProbeEnvelope();
      expect(envelope, 'the rig must be measurable, or the fold has nothing to solve').not.toBeNull();

      // Establish the pre-contact reach. This is the whole reason retreat alone
      // cannot work: the rig starts metres in front of a wall 0.40 m away.
      settle(rig, {});
      const open = rigExtent(rig);
      expect(open.furthest).toBeGreaterThan(WALL_DISTANCE_METERS);

      settle(rig, {
        surfaceRetreat: viewmodelSurfaceRetreat(WALL_DISTANCE_METERS, false, weapon),
        surfaceContactDepth: WALL_DISTANCE_METERS,
      });

      const visible = visibleForwardMeters(rig);
      expect(
        visible - WALL_DISTANCE_METERS,
        `${weapon}: furthest visible ${visible.toFixed(3)} m vs surface ${WALL_DISTANCE_METERS} m`,
      ).toBeLessThanOrEqual(0);

      // And it must not have solved the wall by putting the rig in the camera.
      expect(rigExtent(rig).nearest).toBeGreaterThanOrEqual(rig.camera.near);
    });
  }

  it('the fold does the work, and the cut only covers what physics leaves', async () => {
    // The cut must not quietly become the fix. Two things are pinned here.
    //
    // FIRST, honestly: the fold does NOT close a 0.40 m wall on its own, and no
    // parameter in this design can make it. The forward-most point is bounded
    // below by nearPlane + rigDepth; measured on the carbine at 0.40 m the fold
    // gets the silhouette to ~0.52 m and the remaining ~0.12 m is cut. Pinning
    // residual <= 0 here would be pinning a physical impossibility, and the way
    // to pass it would be to weaken something.
    //
    // SECOND, and this is the guard that matters: the residual is bounded, and
    // the fold must still be carrying the overwhelming majority of the travel.
    for (const weapon of ['carbine', 'sniper'] as const) {
      const rig = await mountedRig(weapon);
      settle(rig, {});
      const openReach = rigExtent(rig).furthest;
      settle(rig, {
        surfaceRetreat: viewmodelSurfaceRetreat(WALL_DISTANCE_METERS, false, weapon),
        surfaceContactDepth: WALL_DISTANCE_METERS,
      });
      const fold = rig.presentation.contactFoldState();
      expect(fold.engaged, weapon).toBe(true);
      // The residual is what the cut removes. It is small, and it is bounded.
      expect(fold.residualMeters, `${weapon} residual after the fold`).toBeLessThanOrEqual(0.2);
      // The fold closed at least 85% of the distance on its own.
      const closedByFold = openReach - fold.forwardReachMeters;
      expect(closedByFold / (openReach - WALL_DISTANCE_METERS), weapon).toBeGreaterThan(0.85);
      // ... and the residual must be measured on the silhouette, not the socket.
      expect(fold.forwardReachMeters).toBeGreaterThanOrEqual(fold.muzzleForwardMeters - 1e-9);
    }
  });

  it('arms the cut at the surface while in contact, and nowhere else', async () => {
    const rig = await mountedRig('carbine');
    settle(rig, {});
    expect(rig.presentation.contactFoldState().clipPlaneDistanceMeters).toBeNull();
    expect((rig.presentation.root as unknown as { enabled: boolean }).enabled).toBe(false);

    settle(rig, {
      surfaceRetreat: viewmodelSurfaceRetreat(WALL_DISTANCE_METERS, false, 'carbine'),
      surfaceContactDepth: WALL_DISTANCE_METERS,
    });
    const clippingRoot = rig.presentation.root as unknown as {
      isClippingGroup: boolean; enabled: boolean; clippingPlanes: THREE.Plane[];
    };
    expect(clippingRoot.isClippingGroup).toBe(true);
    expect(clippingRoot.enabled).toBe(true);
    expect(clippingRoot.clippingPlanes).toHaveLength(1);
    expect(rig.presentation.contactFoldState().clipPlaneDistanceMeters)
      .toBeCloseTo(WALL_DISTANCE_METERS, 6);

    // The kept half-space is camera-side: the eye must be inside it and a point
    // beyond the surface must not be.
    const plane = clippingRoot.clippingPlanes[0];
    const eye = rig.camera.getWorldPosition(new THREE.Vector3());
    const forward = rig.camera.getWorldDirection(new THREE.Vector3());
    expect(plane.distanceToPoint(eye)).toBeGreaterThan(0);
    expect(plane.distanceToPoint(eye.clone().addScaledVector(forward, WALL_DISTANCE_METERS + 0.05)))
      .toBeLessThan(0);
  });

  it('does not move the open-space pose at all - the fold is contact-only', async () => {
    const rig = await mountedRig('carbine');
    settle(rig, {});
    const openRoot = rig.presentation.root.position.clone();
    const openRotation = rig.presentation.root.rotation.x;
    const openScale = rig.presentation.root.scale.x;
    const openMuzzle = muzzleForwardMeters(rig);
    const openExtent = rigExtent(rig).furthest;

    // Same frames again, with an explicit "nothing in range" contact depth.
    settle(rig, { surfaceContactDepth: null });
    expect(rig.presentation.root.position.z).toBeCloseTo(openRoot.z, 9);
    expect(rig.presentation.root.rotation.x).toBeCloseTo(openRotation, 9);
    expect(rig.presentation.root.scale.x).toBeCloseTo(openScale, 9);
    expect(muzzleForwardMeters(rig)).toBeCloseTo(openMuzzle, 9);
    expect(rigExtent(rig).furthest).toBeCloseTo(openExtent, 9);
    expect(rig.presentation.contactFoldState().engaged).toBe(false);
    expect(rig.presentation.contactFoldState().clipPlaneDistanceMeters).toBeNull();
    expect((rig.presentation.root as unknown as { enabled: boolean }).enabled).toBe(false);
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
    // Bounded by physics, not by taste: see "the fold does the work" above.
    expect(state.contactFold.residualMeters).toBeLessThanOrEqual(0.2);
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

  it('solves against the SILHOUETTE, not the socket, and hits the physical floor', () => {
    const fold = solveViewmodelContactFold({ ...base, contactDepthMeters: WALL_DISTANCE_METERS });
    expect(fold.engaged).toBe(true);
    expect(fold.foldPitchRadians).toBeGreaterThan(0);
    expect(base.basePitchRadians + fold.foldPitchRadians)
      .toBeLessThanOrEqual(VIEWMODEL_CONTACT_FOLD_MAXIMUM_PITCH_RADIANS + 1e-9);
    // OPTIMALITY, which is the assertion a "just fold harder" regression cannot
    // satisfy by cheating: no other fold in the family reaches less far. The
    // result is the minimum of the family, not the hardest endpoint of it.
    let leastReach = Number.POSITIVE_INFINITY;
    for (let step = 0; step <= 256; step += 1) {
      const probe = solveViewmodelContactFold({
        ...base,
        contactDepthMeters: WALL_DISTANCE_METERS,
        maximumPitchRadians: base.basePitchRadians
          + (VIEWMODEL_CONTACT_FOLD_MAXIMUM_PITCH_RADIANS - base.basePitchRadians) * (step / 256),
      });
      leastReach = Math.min(leastReach, probe.forwardReachMeters);
    }
    expect(fold.forwardReachMeters).toBeLessThanOrEqual(leastReach + 1e-6);
    // And the near plane is what is binding, not laziness: the rearmost point
    // sits exactly on the limit.
    expect(base.baseRootZ + fold.retreatMeters).toBeCloseTo(fold.nearPlaneLimitZ, 6);
  });

  it('demands strictly more fold than the muzzle criterion did', () => {
    // The regression guard for THIS pass. On these measured bounds the muzzle
    // is 0.22 m behind the forward-most vertex, so a solve that closes the
    // muzzle leaves the magazine through the wall. If the target ever slips
    // back to the socket, this fails.
    const fold = solveViewmodelContactFold({ ...base, contactDepthMeters: WALL_DISTANCE_METERS });
    expect(fold.forwardReachMeters).toBeGreaterThan(fold.muzzleForwardMeters);
    expect(fold.muzzleForwardMeters).toBeLessThan(WALL_DISTANCE_METERS - 0.1);
  });

  it('publishes the cut distance whenever it is solving against a surface', () => {
    for (const depth of [0.2, 0.4, 0.9, 2.2]) {
      expect(solveViewmodelContactFold({ ...base, contactDepthMeters: depth }).clipPlaneDistanceMeters)
        .toBeCloseTo(depth, 9);
    }
    expect(solveViewmodelContactFold({ ...base, contactDepthMeters: null }).clipPlaneDistanceMeters)
      .toBeNull();
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
    const gentle = solveViewmodelContactFold({ ...base, contactDepthMeters: 1.9 });
    expect(gentle.forwardReachMeters).toBeLessThanOrEqual(1.9);
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
