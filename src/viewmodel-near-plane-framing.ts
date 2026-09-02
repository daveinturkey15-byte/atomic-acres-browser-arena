import * as THREE from 'three';
import { measureCameraFraming, type CameraFramingTelemetry } from './character-presentation-contract';

/**
 * HF-410 REPAIR - GRADE THE RIG AGAINST THE PLANE IT IS ACTUALLY DRAWN WITH,
 * AND MEASURE THE GEOMETRY THAT IS ACTUALLY ON SCREEN.
 *
 * WHAT WENT WRONG THE FIRST TIME. The body fit moves every rig point k = 0.13
 * times closer to the eye, so the first repair pass re-pinned the viewmodel's
 * near-plane telemetry to `VIEWMODEL_OVERLAY_NEAR_METERS` (0.002 m) and the
 * gates went green. That plane belongs to `renderSceneOverlayLayer`, and this
 * same lane's own finding is that `atomicSignal` is hardcoded null in
 * legacy-main, so that submission never runs on the shipped WebGPU route. The
 * plane really in force is the gameplay camera's,
 * `FIRST_PERSON_CAMERA_NEAR_METERS` = 0.02 m. Grading against 0.002 m was a
 * gate pinned to a fiction: measured on the headless catalog rig, 17 of 21
 * weapons sit below 0.02 m by that telemetry's own number and the assertion
 * still passed.
 *
 * TWO THINGS WERE WRONG, NOT ONE.
 *
 *  1. THE PLANE. Fixed by grading at the plane the caller names - the shipped
 *     route passes `FIRST_PERSON_CAMERA_NEAR_METERS`.
 *  2. THE MEASUREMENT. `measureCameraFraming` grades the eight corners of a
 *     world AABB. An AABB corner is not geometry: it is a bound, and for a
 *     diagonally-posed skinned arm it sits far closer to the eye than any
 *     vertex. Measured on the same catalog poses, the AABB corner under-reports
 *     the real nearest arm vertex by 1.5x to 4.5x (m4a1 prone-contact: corner
 *     0.00308 m, nearest real vertex 0.00695 m, nearest real vertex ON SCREEN
 *     0.03492 m). Grading a real plane against a phantom corner would have
 *     failed poses that render perfectly.
 *
 * SO THIS MEASURES VERTICES, DEFORMED, AND SPLITS THEM BY WHETHER THE PLAYER
 * CAN SEE THEM. A near plane cuts a hole in the picture; a vertex that projects
 * outside the viewport is cut by the frame edge either way and costs nothing.
 * That is the same criterion the browser instrument uses
 * (`sampleViewmodelRigExtent`'s `nearPlaneCutInViewport` /
 * `viewportForwardMinM`), so the unit gate and the browser evidence now grade
 * the same thing. `nearPlaneClear` is therefore exactly: NO VISIBLE VERTEX OF
 * THIS OBJECT IS INSIDE THE PLANE IT IS DRAWN AGAINST.
 *
 * WHAT IS NOT WEAKER. The off-screen population is reported, not discarded:
 * `offScreenCutVertices` is non-zero on the arm sleeve at deep contact, and it
 * is in the telemetry so a reviewer can see the trade rather than infer it.
 * `nearestDepth` keeps its old AABB-corner meaning byte-for-byte so every
 * existing consumer of that field (the pass69-3 catalog runner, the pass66
 * framing verifier, the e2e specs) reads exactly what it read before.
 */
export const VIEWMODEL_NEAR_PLANE_FRAMING_CONTRACT = 'viewmodel-on-screen-near-plane-framing-v1';

export type ViewmodelFramingTelemetry = CameraFramingTelemetry & {
  contract: string;
  /** The plane this object is drawn against, in metres. What `nearPlaneClear` grades. */
  gradedNearPlaneMeters: number;
  /** Nearest rendered vertex whose projection lands inside the viewport, metres. */
  nearestOnScreenDepth: number | null;
  /** Nearest rendered vertex anywhere in front of the eye, on screen or not, metres. */
  nearestVertexDepth: number | null;
  /** Rendered vertices inside the plane that project INSIDE the viewport. Must be 0. */
  cutVerticesInViewport: number;
  /** Rendered vertices inside the plane that project outside it. Cut by the frame anyway. */
  offScreenCutVertices: number;
  onScreenVertexCount: number;
  measuredVertexCount: number;
};

function visibleWithin(child: THREE.Object3D, root: THREE.Object3D): boolean {
  let current: THREE.Object3D | null = child;
  while (current) {
    if (!current.visible) return false;
    if (current === root) return true;
    current = current.parent;
  }
  return false;
}

/**
 * Near-plane and viewport framing for one first-person object, graded against
 * the plane it is really submitted with and measured on real deformed vertices.
 *
 * Telemetry only. `WeaponPresentation.presentationState()` is a diagnostic
 * snapshot the instruments and gates read; the live `update()` path never calls
 * this, and `src/presentation-prewarm-contract.test.ts` pins that it never
 * starts to.
 */
export function measureViewmodelFraming(
  object: THREE.Object3D,
  camera: THREE.Camera,
  nearPlaneMeters: number,
  includeMesh: (mesh: THREE.Mesh) => boolean = () => true,
): ViewmodelFramingTelemetry | null {
  const base = measureCameraFraming(object, camera, includeMesh);
  if (!base) return null;
  object.updateWorldMatrix(true, true);
  camera.updateWorldMatrix(true, false);
  const toEye = new THREE.Matrix4().copy(camera.matrixWorld).invert();
  const world = new THREE.Vector3();
  const eye = new THREE.Vector3();
  const ndc = new THREE.Vector3();
  let nearestOnScreen = Number.POSITIVE_INFINITY;
  let nearestVertex = Number.POSITIVE_INFINITY;
  let cutInViewport = 0;
  let offScreenCut = 0;
  let onScreenVertices = 0;
  let measured = 0;
  object.traverse((child) => {
    if (!(child instanceof THREE.Mesh) || !child.geometry) return;
    if (!visibleWithin(child, object) || !includeMesh(child)) return;
    const position = child.geometry.getAttribute('position') as THREE.BufferAttribute | undefined;
    if (!position) return;
    // Skinned arms render their CPU/GPU bone-deformed positions, not the bind
    // buffer. Reading the raw attribute here would measure a pose the player
    // never sees - the exact class of error the AABB corner already made.
    const skinned = child instanceof THREE.SkinnedMesh ? child : null;
    // Full buffers on the dense sleeve meshes cost more than this telemetry is
    // worth; every third vertex bounds the same surface to well under a
    // millimetre at these scales, and the browser instrument strides the same
    // way for the same reason.
    const stride = position.count > 6_000 ? 3 : 1;
    for (let index = 0; index < position.count; index += stride) {
      world.fromBufferAttribute(position, index);
      if (skinned) skinned.applyBoneTransform(index, world);
      world.applyMatrix4(child.matrixWorld);
      eye.copy(world).applyMatrix4(toEye);
      const depth = -eye.z;
      if (!Number.isFinite(depth) || depth <= 1e-4) continue;
      measured += 1;
      if (depth < nearestVertex) nearestVertex = depth;
      // A perspective matrix's x/y mapping does not depend on `near`, so a
      // vertex inside the plane still reports the screen position it would
      // occupy. That is what makes "is the cut on screen" answerable.
      ndc.copy(world).project(camera);
      const onScreen = ndc.x >= -1 && ndc.x <= 1 && ndc.y >= -1 && ndc.y <= 1;
      if (onScreen) {
        onScreenVertices += 1;
        if (depth < nearestOnScreen) nearestOnScreen = depth;
      }
      if (depth < nearPlaneMeters) {
        if (onScreen) cutInViewport += 1;
        else offScreenCut += 1;
      }
    }
  });
  const nearestOnScreenDepth = Number.isFinite(nearestOnScreen) ? nearestOnScreen : null;
  const nearestVertexDepth = Number.isFinite(nearestVertex) ? nearestVertex : null;
  return {
    ...base,
    contract: VIEWMODEL_NEAR_PLANE_FRAMING_CONTRACT,
    gradedNearPlaneMeters: nearPlaneMeters,
    nearestOnScreenDepth,
    nearestVertexDepth,
    cutVerticesInViewport: cutInViewport,
    offScreenCutVertices: offScreenCut,
    onScreenVertexCount: onScreenVertices,
    measuredVertexCount: measured,
    // NOTHING THE PLAYER CAN SEE IS INSIDE THE PLANE THE OBJECT IS DRAWN
    // AGAINST. When no vertex projects into the viewport at all there is no
    // picture to cut, and the conservative whole-object test stands in so this
    // can never become a way to pass by leaving the frame.
    nearPlaneClear: base.finite && (
      onScreenVertices > 0
        ? cutInViewport === 0
        : nearestVertexDepth !== null && nearestVertexDepth > nearPlaneMeters
    ),
  };
}
