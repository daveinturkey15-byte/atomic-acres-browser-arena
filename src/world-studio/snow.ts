import * as THREE from 'three';

/** One bounded draw of camera-local flakes, with deterministic absolute-time motion. */
export function createStudioSnow(): { root: THREE.Group; update: (time: number, camera: THREE.Vector3, intensity: number, wind: number) => void } {
  const root = new THREE.Group(); root.name = 'world-studio-snow'; root.userData.dynamic = true;
  root.userData.presentationOnly = true;
  const material = new THREE.MeshBasicMaterial({ color: 0xf3f7ff, transparent: true, opacity: .55, depthWrite: false });
  const mesh = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(.027, 0), material, 420);
  mesh.frustumCulled = false; mesh.userData.dynamic = true; mesh.userData.presentationOnly = true;
  root.add(mesh); root.visible = false;
  const transform = new THREE.Matrix4();
  const wrap = (value: number, size: number) => ((value % size) + size) % size;
  return { root, update(time, camera, intensity, wind) {
    root.visible = intensity > .001;
    if (!root.visible) return;
    mesh.count = Math.floor(420 * Math.min(1, Math.max(0, intensity)));
    for (let i = 0; i < mesh.count; i += 1) {
      const x = wrap(i * 8.381 + time * wind - camera.x, 28) + camera.x - 14;
      const z = wrap(i * 5.139 + Math.sin(time * .4 + i) * .35 - camera.z, 28) + camera.z - 14;
      let y = wrap(i * 2.613 - time * (.65 + (i % 7) * .045), 13) - .1;
      // The two roof volumes shelter rooms; avoid camera-near/aim-centre snow clutter.
      if ((Math.abs(x) > 12.7 && Math.abs(x) < 27.3 && Math.abs(z) < 9.3 && y < 8.2)
        || (Math.abs(x) > 15.7 && Math.abs(x) < 24.3 && z > 8.7 && z < 19.3 && y < 3.7)
        || Math.hypot(x - camera.x, z - camera.z) < 2) y = -100;
      transform.makeTranslation(x, y, z); mesh.setMatrixAt(i, transform);
    }
    mesh.instanceMatrix.needsUpdate = true;
  } };
}
