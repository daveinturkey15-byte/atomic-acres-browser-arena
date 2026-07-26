import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { projectSupportDamageAnchor } from './support-damage-feedback';

function reviewCamera(): THREE.PerspectiveCamera {
  const camera = new THREE.PerspectiveCamera(60, 16 / 9, 0.05, 200);
  camera.position.set(0, 0, 0);
  camera.lookAt(0, 0, -1);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld(true);
  return camera;
}

describe('support damage feedback projection', () => {
  it('anchors feedback to the admitted target instead of the caller reticle', () => {
    const camera = reviewCamera();
    const centre = projectSupportDamageAnchor(new THREE.Vector3(0, 0, -10), camera, { width: 1920, height: 1080 });
    const rightTarget = projectSupportDamageAnchor(new THREE.Vector3(4, 0, -10), camera, { width: 1920, height: 1080 });
    expect(centre).toMatchObject({ visible: true, xPx: 960, yPx: 540 });
    expect(rightTarget.visible).toBe(true);
    expect(rightTarget.xPx).toBeGreaterThan(centre.xPx + 300);
    expect(rightTarget.yPx).toBeCloseTo(centre.yPx, 5);
  });

  it('never substitutes the reticle for off-screen or behind-camera targets', () => {
    const camera = reviewCamera();
    expect(projectSupportDamageAnchor(new THREE.Vector3(40, 0, -10), camera, { width: 1280, height: 720 }))
      .toMatchObject({ visible: false, reason: 'offscreen' });
    expect(projectSupportDamageAnchor(new THREE.Vector3(0, 0, 8), camera, { width: 1280, height: 720 }))
      .toMatchObject({ visible: false, reason: 'behind-camera' });
  });
});
