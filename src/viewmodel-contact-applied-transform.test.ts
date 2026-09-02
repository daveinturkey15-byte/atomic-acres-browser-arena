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
import {
  VIEWMODEL_CONTACT_ENVELOPE_CONTRACT,
  viewmodelObstructionPose,
  viewmodelSurfaceRetreat,
} from './weapon-presentation-state';
import {
  measuredEnvelopeContactDepthMeters,
  measuredEnvelopeCutDepthMeters,
  nearestViewmodelForwardObstructionMeters,
  type ViewmodelObstructionPoseInput,
} from './systems/viewmodel-contact-probe';
import { VIEWMODEL_SURFACE_CLIP_PLANE_COUNT } from './systems/viewmodel-surface-clip';
import { type WeaponPose } from './weapon-presentation';
import {
  VIEWMODEL_BODY_FIT_SCALE,
  VIEWMODEL_OVERLAY_NEAR_METERS,
  viewmodelRigToWorldMeters,
} from './viewmodel-body-fit';

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

/**
 * The carbine's rig bounds, MEASURED in installed Chrome on 2026-08-31. These
 * are data, not estimates: they come out of
 * docs/assets/viewmodel-clipping-fix-2026-08-31/. Module-scope because both the
 * solve block and the cut block below grade against the same real rig.
 */
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
  // HF-410: THE HARNESS MUST NOT RE-MOUNT THE RIG.
  //
  // This used to call `camera.add(presentation.root)`, on the reasoning that
  // camera space and the root's parent space are the same space. They are not
  // any more: the presentation mounts itself as camera -> bodyFitRoot -> root,
  // and bodyFitRoot carries the uniform scale that puts the rig inside the
  // player's collision capsule (src/viewmodel-body-fit.ts). Re-parenting the
  // root here orphaned that node, so every number below would have been
  // measured on the UNFITTED rig - the exact defect this file grades.
  expect(presentation.root.parent, 'the rig mounts through the body-fit node')
    .toBe(presentation.bodyFitRoot);
  expect(presentation.bodyFitRoot.parent, 'and that node mounts on the camera').toBe(camera);
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
  // HF-410: the fold solve compares the rig's ROOT-LOCAL bounds against a depth
  // handed to it in the same frame, so every metre it reports back is a rig
  // metre. `extent` is measured through the camera and is therefore in world
  // metres. Convert, or this compares two different units.
  return Math.min(extent.furthest, viewmodelRigToWorldMeters(cut) - VIEWMODEL_CONTACT_CLIP_MARGIN_METERS);
}

describe('applied transform: no VISIBLE geometry finishes past the surface (owner 2026-08-31)', () => {
  for (const weapon of CONTACT_WEAPONS) {
    it(`${weapon} keeps its whole silhouette out of a wall 0.40 m from the eye`, async () => {
      const rig = await mountedRig(weapon);
      const envelope = rig.presentation.contactProbeEnvelope();
      expect(envelope, 'the rig must be measurable, or the fold has nothing to solve').not.toBeNull();

      // RE-PINNED FOR HF-410 (owner, 2026-09-02: "gun clipping through walls and
      // floor aswell as holding it up ... is super bad, needs a re work").
      //
      // This used to assert the OPPOSITE - `open.furthest > 0.40` - and it was
      // right to, because it was pinning the defect: the rig started metres in
      // front of a wall it was already inside, which is why retreat alone could
      // never work and why a fold and a cut were bolted on afterwards. The rig
      // is now fitted inside the player's own collision capsule
      // (src/viewmodel-body-fit.ts), so at rest it no longer reaches the
      // owner's failing distance at all. That is the fix, so it is what this
      // line pins.
      //
      // The capsule number itself (0.316 m radial against a 0.38 m radius) is
      // graded by the browser instrument on the real GLB rig -
      // scripts/qa/measure-viewmodel-body-fit-cdp.mjs, evidence under
      // docs/evidence/pass85/hf410/. This harness runs the headless fallback
      // rig, which is a different and larger mesh, so pinning the capsule
      // figure HERE would be pinning a number about the wrong geometry.
      settle(rig, {});
      const open = rigExtent(rig);
      expect(rig.presentation.bodyFitRoot.scale.x, 'the fit must be in force')
        .toBeCloseTo(VIEWMODEL_BODY_FIT_SCALE, 9);
      expect(open.furthest, `${weapon} at rest must not reach the owner's 0.40 m wall`)
        .toBeLessThan(WALL_DISTANCE_METERS);

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
      // HF-410: the plane that can actually clip the rig is the overlay's, not
      // the gameplay camera's - the first-person layer is a separate
      // depth-cleared submission with its own near plane.
      expect(rigExtent(rig).nearest).toBeGreaterThanOrEqual(VIEWMODEL_OVERLAY_NEAR_METERS);
    });
  }

  it('the fit does the work, and the fold stays a live last resort', async () => {
    // RE-PINNED FOR HF-410, and this is the honest statement of what changed.
    //
    // This test used to pin that the FOLD carried at least 85% of the travel at
    // the owner's 0.40 m wall, with a bounded residual for the cut to remove.
    // That was the right guard for the design it graded - one where the rig hung
    // 1.2-1.6 m outside the player's own 0.38 m collision capsule and something
    // had to drag it back every time the player walked up to anything.
    //
    // With the rig fitted inside the capsule there is nothing to drag: the
    // 0.40 m wall is outside the rig, so the fold correctly does not engage,
    // and a percentage-of-travel assertion has no travel to measure. Replacing
    // it with `engaged === false` is not a relaxation - it is a STRICTER claim
    // than the old one, because the old test tolerated a rig that reached the
    // wall provided something pulled it back.
    //
    // The second block is what stops that being a way to pass by disarming the
    // safety net: with a surface genuinely INSIDE the fitted rig, the fold must
    // still engage, still be bounded, and still be measured on the silhouette
    // rather than the muzzle socket. Its 1.5 rad ceiling is untouched.
    const INSIDE_THE_FITTED_RIG_METERS = 0.12;
    for (const weapon of ['carbine', 'sniper'] as const) {
      const rig = await mountedRig(weapon);
      settle(rig, {});
      const openReach = rigExtent(rig).furthest;
      expect(openReach, `${weapon} must already clear the owner's wall`).toBeLessThan(WALL_DISTANCE_METERS);

      settle(rig, {
        surfaceRetreat: viewmodelSurfaceRetreat(WALL_DISTANCE_METERS, false, weapon),
        surfaceContactDepth: WALL_DISTANCE_METERS,
      });
      // `engaged` means "the solve produced this result", not "a fold was
      // applied" - it is deliberately non-flickering because the renderer picks
      // its translation source from it. The properties that say whether the rig
      // was MOVED are the pitch, the retreat and the residual, and all three
      // must be exactly zero: at the owner's failing distance the fitted rig
      // needs no help at all.
      const clear = rig.presentation.contactFoldState();
      expect(clear.foldPitchRadians, `${weapon}: no high-ready pose at a 0.40 m wall`).toBe(0);
      expect(clear.retreatMeters, `${weapon}: no pullback at a 0.40 m wall`).toBe(0);
      expect(clear.residualMeters, `${weapon}: nothing left for the cut to remove`).toBe(0);

      settle(rig, {
        surfaceRetreat: viewmodelSurfaceRetreat(INSIDE_THE_FITTED_RIG_METERS, false, weapon),
        surfaceContactDepth: INSIDE_THE_FITTED_RIG_METERS,
      });
      const contact = rig.presentation.contactFoldState();
      expect(contact.foldPitchRadians, `${weapon}: the last resort must still arm`)
        .toBeGreaterThan(0);
      expect(contact.residualMeters, `${weapon} residual after the fold`).toBeLessThanOrEqual(0.2);
      // ... and the residual must be measured on the silhouette, not the socket.
      expect(contact.forwardReachMeters).toBeGreaterThanOrEqual(contact.muzzleForwardMeters - 1e-9);
    }
  });

  it('arms the cut at the surface while in contact, and nowhere else', async () => {
    const rig = await mountedRig('carbine');
    settle(rig, {});
    expect(rig.presentation.contactFoldState().clipPlaneDistanceMeters).toBeNull();
    // Re-pinned 2026-08-31. This asserted `enabled === false` out of contact.
    // That WAS the freeze: toggling the clipping state flips every viewmodel
    // material's shader permutation, so three recompiled the weapon, lenses,
    // sleeve and gloves on every wall approach and departure. Measured 85.7% of
    // all pipeline creations landing inside a stall (31x enrichment).
    //
    // The group is now armed for the rig's lifetime and the PLANE parks instead.
    // So pin the property that actually matters - out of contact the plane must
    // clip NOTHING - which is strictly stronger than pinning a boolean, because
    // an armed-but-wrongly-placed plane would eat the weapon and still pass the
    // old check.
    {
      const clipRoot = rig.presentation.root as unknown as {
        enabled: boolean; clippingPlanes: THREE.Plane[];
      };
      expect(clipRoot.enabled, 'the group stays armed - toggling it is what froze the game').toBe(true);
      const parked = clipRoot.clippingPlanes[0];
      // Every vertex of the rig sits within ~3 m of the camera; the parked plane
      // must leave all of it on the kept side (positive distance).
      for (const probe of [0, 0.5, 1, 2, 3]) {
        const point = new THREE.Vector3(0, 0, -probe).applyMatrix4(rig.camera.matrixWorld);
        expect(parked.distanceToPoint(point), `rig point at ${probe} m must survive the parked cut`)
          .toBeGreaterThan(0);
      }
    }

    settle(rig, {
      surfaceRetreat: viewmodelSurfaceRetreat(WALL_DISTANCE_METERS, false, 'carbine'),
      surfaceContactDepth: WALL_DISTANCE_METERS,
    });
    const clippingRoot = rig.presentation.root as unknown as {
      isClippingGroup: boolean; enabled: boolean; clippingPlanes: THREE.Plane[];
    };
    expect(clippingRoot.isClippingGroup).toBe(true);
    expect(clippingRoot.enabled).toBe(true);
    // THE INVARIANT IS THAT THIS NUMBER NEVER MOVES, not that it is any
    // particular value. three folds the clipping-plane COUNT into a material's
    // shader cache key, so an array that grows and shrinks with the number of
    // nearby surfaces would recompile every viewmodel material on every wall
    // approach - the defect that had 85.7% of all pipeline creations landing
    // inside a stall on 2026-08-31. The rig therefore keeps one camera-facing
    // contact plane plus a fixed set of surface-aligned slots, and parks the
    // ones it is not using.
    const EXPECTED_PLANES = 1 + VIEWMODEL_SURFACE_CLIP_PLANE_COUNT;
    expect(clippingRoot.clippingPlanes).toHaveLength(EXPECTED_PLANES);
    // HF-410: the solve reports rig metres (its depth inputs are converted into
    // the rig's frame on the way in); the wall is a world distance.
    expect(viewmodelRigToWorldMeters(
      rig.presentation.contactFoldState().clipPlaneDistanceMeters as number,
    )).toBeCloseTo(WALL_DISTANCE_METERS, 6);

    // The kept half-space is camera-side: the eye must be inside it and a point
    // beyond the surface must not be.
    // Slot 0 is the camera-perpendicular contact cut; the rest are surfaces.
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
    // Re-pinned 2026-08-31. This asserted `enabled === false` out of contact.
    // That WAS the freeze: toggling the clipping state flips every viewmodel
    // material's shader permutation, so three recompiled the weapon, lenses,
    // sleeve and gloves on every wall approach and departure. Measured 85.7% of
    // all pipeline creations landing inside a stall (31x enrichment).
    //
    // The group is now armed for the rig's lifetime and the PLANE parks instead.
    // So pin the property that actually matters - out of contact the plane must
    // clip NOTHING - which is strictly stronger than pinning a boolean, because
    // an armed-but-wrongly-placed plane would eat the weapon and still pass the
    // old check.
    {
      const clipRoot = rig.presentation.root as unknown as {
        enabled: boolean; clippingPlanes: THREE.Plane[];
      };
      expect(clipRoot.enabled, 'the group stays armed - toggling it is what froze the game').toBe(true);
      const parked = clipRoot.clippingPlanes[0];
      // Every vertex of the rig sits within ~3 m of the camera; the parked plane
      // must leave all of it on the kept side (positive distance).
      for (const probe of [0, 0.5, 1, 2, 3]) {
        const point = new THREE.Vector3(0, 0, -probe).applyMatrix4(rig.camera.matrixWorld);
        expect(parked.distanceToPoint(point), `rig point at ${probe} m must survive the parked cut`)
          .toBeGreaterThan(0);
      }
    }
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

/**
 * THE CUT'S OWN GATE, added 2026-08-31 after the owner reported the opposite
 * failure: the weapon vanishing.
 *
 * The pass above closed the penetration number - 60 of 68 contact rows had
 * visible geometry through the wall, then 0 - and it closed it partly with a
 * plane placed at `contactDepthMeters`, the conservative minimum over the
 * nine-probe lattice. Measured over the same 68 rows: 15 were cut nearer than
 * 0.25 m, and at `atomic-acres/corner` and `test2/flat-wall` the frame came
 * back EMPTY with the on-axis surface at 0.400 m.
 *
 * The cause was not a second surface off to one side. It was the SAME wall,
 * met at 45 degrees, sampled by a lattice centred on the rig - which sits
 * 0.33 m to the RIGHT of the eye, a third of a metre nearer that wall. The
 * probes were right; the plane was the wrong shape for their answer.
 *
 * So the two questions are separated, and this block pins the separation in
 * both directions. Making the fold use the on-axis number, or the cut use the
 * conservative one, fails here.
 */
describe('the cut is placed by what a plane can represent (owner 2026-08-31)', () => {
  /** The carbine's real measured envelope, from installed Chrome on 2026-08-31. */
  const CARBINE_ENVELOPE = Object.freeze({
    contract: VIEWMODEL_CONTACT_ENVELOPE_CONTRACT,
    weapon: 'carbine' as const,
    minX: 0.19833852287900303,
    maxX: 0.45886844423053896,
    minY: -0.8394522721789852,
    maxY: -0.1106662365348069,
    forwardReachMeters: 1.970489135742839,
  });

  /** Camera-forward (0, 0, -1) rotated by yaw. Mirrors the lattice's own basis. */
  const forwardFor = (yaw: number) => ({ x: -Math.sin(yaw), y: 0, z: -Math.cos(yaw) });

  function world(overrides: Partial<ViewmodelObstructionPoseInput>): ViewmodelObstructionPoseInput {
    return {
      weapon: 'carbine',
      position: { x: 0, y: 1.7, z: 0 },
      yaw: 0,
      pitch: 0,
      colliders: [],
      dressingBoxes: [],
      envelope: CARBINE_ENVELOPE,
      grounded: true,
      prone: false,
      stanceEyeHeightMeters: 1.7,
      lastGroundedFeetY: null,
      ...overrides,
    };
  }

  it('reads a wall met at 45 degrees at the crosshair, not at the barrel', () => {
    // The live `atomic-acres/corner` row, rebuilt: a long wall whose camera-side
    // face is x = 0, an eye 0.400 m off it ALONG THE VIEW AXIS, and a heading of
    // 3pi/4 so that "camera right" points at the wall.
    const yaw = (3 * Math.PI) / 4;
    const forward = forwardFor(yaw);
    const eye = { x: 0.4 * -forward.x, y: 1.7, z: 0.4 * -forward.z };
    const wall = { minX: -1, maxX: 0, minZ: -50, maxZ: 50, minY: 0, maxY: 3 };
    const input = world({ position: eye, yaw, colliders: [wall] });

    // The FOLD's number stays conservative, and that is correct: the rig really
    // is inside that wall on its right, and the pose must retreat from it.
    const fold = measuredEnvelopeContactDepthMeters(input);
    expect(fold, 'the fold must still see the wall').not.toBeNull();
    expect(fold!, 'the conservative sweep reads the wall from the rig, not the eye')
      .toBeLessThan(0.25);

    // The CUT's number is where that wall crosses the view axis - the only depth
    // a camera-perpendicular plane can honestly stand in for.
    const cut = measuredEnvelopeCutDepthMeters(input);
    expect(cut, 'the wall crosses the view axis and must place a cut').not.toBeNull();
    expect(cut!, 'the crossing is the ballistic surface distance').toBeCloseTo(0.4, 6);
  });

  it('is not fooled by the padding the lattice sweeps with', () => {
    // Faced head-on, the two must agree to within the padding restore, and the
    // cut must land on the wall itself. Taking the plane constant from the
    // padded HIT POINT instead of the box face put it 0.19 m in front of a wall
    // at 0.40 m and emptied even the head-on frames.
    const wall = { minX: -50, maxX: 50, minZ: -1, maxZ: 0, minY: 0, maxY: 3 };
    const input = world({ position: { x: 0, y: 1.7, z: 0.4 }, colliders: [wall] });
    expect(measuredEnvelopeCutDepthMeters(input)).toBeCloseTo(0.4, 6);
  });

  it('places no cut for a wall running alongside the view axis', () => {
    // A wall you are standing BESIDE occludes a lateral slab of the frame, never
    // a depth slab. It must fold the pose and must not place a plane; cutting
    // there is what deleted the weapon.
    const wall = { minX: 0.5, maxX: 1.5, minZ: -50, maxZ: 50, minY: 0, maxY: 3 };
    const input = world({ colliders: [wall] });
    expect(measuredEnvelopeContactDepthMeters(input), 'the fold must still retreat from it')
      .not.toBeNull();
    expect(measuredEnvelopeCutDepthMeters(input), 'no crossing, no cut').toBeNull();
  });

  it('keeps the dressing set able to cut, and the authored sweep unable to', () => {
    // Decoration bends the gun and now also occludes it - a crate in front of
    // the muzzle hides the muzzle. What it still may never do is reach the
    // trigger, and `nearestViewmodelForwardObstructionMeters` is the number the
    // fire gate consumes: it must not see this box at all.
    const crate = { minX: -2, maxX: 2, minZ: -0.6, maxZ: -0.4, minY: 0, maxY: 2 };
    const input = world({ dressingBoxes: [crate] });
    expect(measuredEnvelopeCutDepthMeters(input)).toBeCloseTo(0.4, 6);
    expect(nearestViewmodelForwardObstructionMeters({ ...input, dressingBoxes: [] })).toBeNull();
  });

  it('leaves a weapon on the screen when the surface is 0.40 m away', async () => {
    // ACCEPTANCE, stated as a unit gate. `atomic-acres/corner/carbine/stand`
    // reproduced: the conservative depth that used to place the plane, and the
    // on-axis depth that now does. Some of the rig must survive the cut.
    const rig = await mountedRig('carbine');
    settle(rig, {
      surfaceRetreat: viewmodelSurfaceRetreat(WALL_DISTANCE_METERS, false, 'carbine'),
      surfaceContactDepth: 0.189,
      surfaceContactCutDepth: WALL_DISTANCE_METERS,
    });
    const fold = rig.presentation.contactFoldState();
    expect(fold.engaged).toBe(true);
    // HF-410: rig metres out of the solve, world metres for the wall.
    expect(
      viewmodelRigToWorldMeters(fold.clipPlaneDistanceMeters as number),
      'the plane follows the on-axis depth',
    ).toBeCloseTo(WALL_DISTANCE_METERS, 9);

    const extent = rigExtent(rig);
    const cutAt = WALL_DISTANCE_METERS - VIEWMODEL_CONTACT_CLIP_MARGIN_METERS;
    expect(
      extent.nearest,
      `nearest rig vertex ${extent.nearest.toFixed(3)} m must be camera-side of the cut at ${cutAt.toFixed(3)} m`,
    ).toBeLessThan(cutAt);
    // ... and the first grade must not have regressed to buy it.
    expect(visibleForwardMeters(rig) - WALL_DISTANCE_METERS).toBeLessThanOrEqual(0);
  });

  it('falls back to the conservative depth when a caller has no cut depth', () => {
    // Every gate written before this pass, and every headless caller, passes one
    // depth. `undefined` has to keep meaning "use it for both"; an explicit
    // `null` has to mean "nothing a plane can represent".
    const base = {
      bounds: MEASURED_CARBINE,
      baseRootZ: -1.14,
      authoredRootZ: -1.14 + 0.78,
      basePitchRadians: 0.82,
      baseScale: 0.734,
      nearPlaneMeters: 0.11,
    };
    expect(solveViewmodelContactFold({ ...base, contactDepthMeters: 0.4 }).clipPlaneDistanceMeters)
      .toBeCloseTo(0.4, 9);
    expect(solveViewmodelContactFold({
      ...base, contactDepthMeters: 0.189, contactCutDepthMeters: 0.4,
    }).clipPlaneDistanceMeters).toBeCloseTo(0.4, 9);
    expect(solveViewmodelContactFold({
      ...base, contactDepthMeters: 0.189, contactCutDepthMeters: null,
    }).clipPlaneDistanceMeters).toBeNull();
    // The FOLD still solved against the conservative number in all three.
    expect(solveViewmodelContactFold({
      ...base, contactDepthMeters: 0.189, contactCutDepthMeters: 0.4,
    }).forwardReachMeters).toBeCloseTo(
      solveViewmodelContactFold({ ...base, contactDepthMeters: 0.189 }).forwardReachMeters,
      9,
    );
  });
});
