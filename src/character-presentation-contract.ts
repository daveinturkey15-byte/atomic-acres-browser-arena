import * as THREE from 'three';
import type { WeaponId } from './protocol';

export type CharacterActionState = 'hip' | 'ads' | 'sprint' | 'reload' | 'melee';

export type CharacterActionContract = {
  state: CharacterActionState;
  weapon: WeaponId;
  aimBlend: number;
  reloadProgress: number | null;
  meleeProgress: number | null;
  supportContactExpected: boolean;
  weaponVisible: boolean;
};

const clamp01 = (value: number): number => THREE.MathUtils.clamp(Number.isFinite(value) ? value : 0, 0, 1);

/**
 * One deterministic priority contract for viewmodel states. Presentation may
 * blend between poses, but telemetry and tests always agree which action owns
 * the hands/weapon: melee > reload > sprint > settled ADS > hip.
 */
export function characterActionContract(input: {
  weapon: WeaponId;
  aimBlend: number;
  sprintBlend: number;
  reloadProgress: number | null;
  meleeProgress: number | null;
}): CharacterActionContract {
  const aimBlend = clamp01(input.aimBlend);
  const sprintBlend = clamp01(input.sprintBlend);
  const reloadProgress = input.reloadProgress === null ? null : clamp01(input.reloadProgress);
  const meleeProgress = input.meleeProgress === null ? null : clamp01(input.meleeProgress);
  const meleeActive = meleeProgress !== null && meleeProgress < 1;
  const reloadActive = reloadProgress !== null && reloadProgress < 1;
  const state: CharacterActionState = meleeActive
    ? 'melee'
    : reloadActive
      ? 'reload'
      : sprintBlend >= 0.5
        ? 'sprint'
        : aimBlend >= 0.92
          ? 'ads'
          : 'hip';
  return {
    state,
    weapon: input.weapon,
    aimBlend,
    reloadProgress,
    meleeProgress,
    supportContactExpected: state !== 'melee',
    weaponVisible: state !== 'melee',
  };
}

/** Resolve a socket only after propagating its complete, current parent chain. */
export function resolveSocketWorld(socket: THREE.Object3D, target = new THREE.Vector3()): THREE.Vector3 {
  socket.updateWorldMatrix(true, false);
  return socket.getWorldPosition(target);
}

/**
 * Geometry bounds expressed in the object's own space. This avoids the
 * misleading world Box3 produced by animated/skinned wrist ancestry.
 */
export function objectLocalGeometryBounds(root: THREE.Object3D): THREE.Box3 | null {
  root.updateWorldMatrix(true, true);
  const inverseRoot = root.matrixWorld.clone().invert();
  const bounds = new THREE.Box3().makeEmpty();
  root.traverse((child) => {
    if (!(child instanceof THREE.Mesh) || !child.geometry || !child.visible) return;
    child.geometry.computeBoundingBox();
    if (!child.geometry.boundingBox) return;
    const meshToRoot = inverseRoot.clone().multiply(child.matrixWorld);
    bounds.union(child.geometry.boundingBox.clone().applyMatrix4(meshToRoot));
  });
  return bounds.isEmpty() ? null : bounds;
}

export type CameraFramingTelemetry = {
  finite: boolean;
  nearPlaneClear: boolean;
  intersectsViewport: boolean;
  fullyInsideViewport: boolean;
  ndcMin: [number, number];
  ndcMax: [number, number];
  nearestDepth: number;
};

/** Deterministic near-plane and viewport framing for a visible object bounds. */
export function measureCameraFraming(
  object: THREE.Object3D,
  camera: THREE.Camera,
  includeMesh: (mesh: THREE.Mesh) => boolean = () => true,
): CameraFramingTelemetry | null {
  object.updateWorldMatrix(true, true);
  camera.updateWorldMatrix(true, false);
  const bounds = new THREE.Box3().makeEmpty();
  object.traverse((child) => {
    if (!(child instanceof THREE.Mesh) || !child.visible || !includeMesh(child)) return;
    child.geometry.computeBoundingBox();
    if (child.geometry.boundingBox) bounds.union(child.geometry.boundingBox.clone().applyMatrix4(child.matrixWorld));
  });
  if (bounds.isEmpty()) return null;
  const corners: THREE.Vector3[] = [];
  for (const x of [bounds.min.x, bounds.max.x]) for (const y of [bounds.min.y, bounds.max.y]) for (const z of [bounds.min.z, bounds.max.z]) {
    corners.push(new THREE.Vector3(x, y, z));
  }
  let minX = Infinity; let minY = Infinity; let maxX = -Infinity; let maxY = -Infinity; let nearestDepth = Infinity;
  let finite = true;
  for (const world of corners) {
    const cameraPoint = camera.worldToLocal(world.clone());
    nearestDepth = Math.min(nearestDepth, -cameraPoint.z);
    const projected = world.project(camera);
    finite = finite && projected.toArray().every(Number.isFinite) && Number.isFinite(nearestDepth);
    minX = Math.min(minX, projected.x); minY = Math.min(minY, projected.y);
    maxX = Math.max(maxX, projected.x); maxY = Math.max(maxY, projected.y);
  }
  const near = camera instanceof THREE.PerspectiveCamera || camera instanceof THREE.OrthographicCamera ? camera.near : 0;
  return {
    finite,
    nearPlaneClear: finite && nearestDepth > near,
    intersectsViewport: finite && maxX >= -1 && minX <= 1 && maxY >= -1 && minY <= 1,
    fullyInsideViewport: finite && minX >= -1 && maxX <= 1 && minY >= -1 && maxY <= 1,
    ndcMin: [minX, minY],
    ndcMax: [maxX, maxY],
    nearestDepth,
  };
}
