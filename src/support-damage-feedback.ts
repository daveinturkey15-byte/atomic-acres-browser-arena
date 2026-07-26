import * as THREE from 'three';

export type SupportDamageScreenAnchor = Readonly<{
  visible: boolean;
  reason: 'visible' | 'behind-camera' | 'offscreen' | 'invalid-viewport';
  xPx: number;
  yPx: number;
  ndcDepth: number;
}>;

/**
 * Projects the host-authored impact-time target position into the caller's
 * current view. Support hit feedback is emitted only at this anchor: it never
 * falls back to the reticle when the target is behind or outside the viewport.
 */
export function projectSupportDamageAnchor(
  targetPosition: THREE.Vector3,
  camera: THREE.Camera,
  viewport: Readonly<{ width: number; height: number }>,
): SupportDamageScreenAnchor {
  if (!Number.isFinite(viewport.width) || !Number.isFinite(viewport.height)
    || viewport.width <= 0 || viewport.height <= 0) {
    return Object.freeze({ visible: false, reason: 'invalid-viewport', xPx: 0, yPx: 0, ndcDepth: 0 });
  }
  camera.updateMatrixWorld(true);
  const cameraSpace = targetPosition.clone().applyMatrix4(camera.matrixWorldInverse);
  if (!Number.isFinite(cameraSpace.z) || cameraSpace.z >= -Math.max(0.001, (camera as THREE.PerspectiveCamera).near ?? 0.01)) {
    return Object.freeze({ visible: false, reason: 'behind-camera', xPx: 0, yPx: 0, ndcDepth: 1 });
  }
  const ndc = targetPosition.clone().project(camera);
  const xPx = (ndc.x * 0.5 + 0.5) * viewport.width;
  const yPx = (-ndc.y * 0.5 + 0.5) * viewport.height;
  const visible = Number.isFinite(ndc.x) && Number.isFinite(ndc.y) && Number.isFinite(ndc.z)
    && ndc.x >= -1 && ndc.x <= 1 && ndc.y >= -1 && ndc.y <= 1 && ndc.z >= -1 && ndc.z <= 1;
  return Object.freeze({
    visible,
    reason: visible ? 'visible' : 'offscreen',
    xPx,
    yPx,
    ndcDepth: ndc.z,
  });
}
