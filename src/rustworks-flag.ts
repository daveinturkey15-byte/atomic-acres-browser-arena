import * as THREE from 'three';

export const RUSTWORKS_WELSH_FLAG = Object.freeze({
  width: 6,
  height: 3.6,
  poleHeight: 20.8,
  clothCenterY: 18.65,
  waveAmplitude: 0.34,
  segmentsX: 20,
  segmentsY: 10,
});

function welshFlagTexture(): THREE.Texture {
  if (typeof document === 'undefined') {
    const pixels = new Uint8Array([
      255, 255, 255, 255, 206, 17, 38, 255,
      34, 139, 34, 255, 206, 17, 38, 255,
    ]);
    const texture = new THREE.DataTexture(pixels, 2, 2, THREE.RGBAFormat);
    texture.needsUpdate = true;
    return texture;
  }

  const canvas = document.createElement('canvas');
  canvas.width = 1_024;
  canvas.height = 614;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Welsh flag canvas is unavailable');

  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, canvas.width, canvas.height / 2);
  context.fillStyle = '#168b3a';
  context.fillRect(0, canvas.height / 2, canvas.width, canvas.height / 2);

  // Deliberately bold dragon silhouette so the national flag remains readable
  // from the Rustworks deck instead of becoming an indistinct red speck.
  context.fillStyle = '#ce1126';
  context.strokeStyle = '#8d0718';
  context.lineWidth = 14;
  context.lineJoin = 'round';
  context.beginPath();
  context.moveTo(207, 386);
  context.bezierCurveTo(139, 335, 132, 250, 210, 208);
  context.bezierCurveTo(253, 185, 307, 202, 342, 240);
  context.lineTo(306, 143);
  context.lineTo(429, 224);
  context.lineTo(485, 121);
  context.lineTo(545, 250);
  context.bezierCurveTo(598, 214, 671, 213, 716, 251);
  context.lineTo(776, 228);
  context.lineTo(824, 259);
  context.lineTo(767, 282);
  context.lineTo(842, 315);
  context.lineTo(760, 328);
  context.bezierCurveTo(720, 379, 657, 396, 596, 374);
  context.lineTo(626, 438);
  context.lineTo(578, 438);
  context.lineTo(529, 365);
  context.lineTo(443, 368);
  context.lineTo(404, 448);
  context.lineTo(350, 448);
  context.lineTo(377, 361);
  context.bezierCurveTo(306, 407, 246, 417, 207, 386);
  context.closePath();
  context.fill();
  context.stroke();

  // Head, tongue, wing cut, horns and claws make the dragon identifiable.
  context.beginPath();
  context.moveTo(719, 251);
  context.lineTo(761, 190);
  context.lineTo(768, 248);
  context.lineTo(821, 210);
  context.lineTo(795, 272);
  context.closePath();
  context.fill();
  context.stroke();
  context.beginPath();
  context.moveTo(797, 291);
  context.lineTo(917, 270);
  context.lineTo(845, 311);
  context.lineTo(916, 333);
  context.stroke();
  context.beginPath();
  context.moveTo(414, 249);
  context.lineTo(500, 174);
  context.lineTo(548, 283);
  context.closePath();
  context.fill();
  context.stroke();
  for (const [x, y] of [[357, 451], [400, 451], [574, 441], [618, 441]] as const) {
    context.beginPath();
    context.moveTo(x, y);
    context.lineTo(x - 28, y + 29);
    context.moveTo(x, y);
    context.lineTo(x + 25, y + 24);
    context.stroke();
  }
  context.fillStyle = '#ffffff';
  context.beginPath();
  context.arc(774, 274, 9, 0, Math.PI * 2);
  context.fill();
  context.fillStyle = '#111111';
  context.beginPath();
  context.arc(777, 274, 4, 0, Math.PI * 2);
  context.fill();

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  texture.needsUpdate = true;
  return texture;
}

export function createRustworksWelshFlag(): THREE.Group {
  const root = new THREE.Group();
  root.name = 'rustworks-quality-welsh-flag';
  root.userData.presentationOnly = true;
  root.userData.blocksShots = false;
  root.userData.rustworksFlagAudit = {
    nation: 'Wales',
    animated: true,
    width: RUSTWORKS_WELSH_FLAG.width,
    height: RUSTWORKS_WELSH_FLAG.height,
    poleHeight: RUSTWORKS_WELSH_FLAG.poleHeight,
  };

  const poleMaterial = new THREE.MeshStandardMaterial({
    color: 0xc7d0d3,
    metalness: 0.82,
    roughness: 0.34,
  });
  const pole = new THREE.Mesh(
    new THREE.CylinderGeometry(0.09, 0.12, 7.2, 12),
    poleMaterial,
  );
  pole.name = 'rustworks-quality-welsh-flag-pole';
  pole.position.set(0, 17.2, 0);
  pole.castShadow = true;
  pole.receiveShadow = true;
  pole.raycast = () => undefined;
  root.add(pole);

  const geometry = new THREE.PlaneGeometry(
    RUSTWORKS_WELSH_FLAG.width,
    RUSTWORKS_WELSH_FLAG.height,
    RUSTWORKS_WELSH_FLAG.segmentsX,
    RUSTWORKS_WELSH_FLAG.segmentsY,
  );
  geometry.translate(RUSTWORKS_WELSH_FLAG.width / 2, 0, 0);
  const basePositions = (geometry.getAttribute('position').array as Float32Array).slice();
  const cloth = new THREE.Mesh(
    geometry,
    new THREE.MeshStandardMaterial({
      map: welshFlagTexture(),
      side: THREE.DoubleSide,
      roughness: 0.72,
      metalness: 0,
    }),
  );
  cloth.name = 'rustworks-quality-welsh-flag-cloth';
  cloth.position.set(0.08, RUSTWORKS_WELSH_FLAG.clothCenterY, 0);
  // Diagonal prevailing wind keeps the flag readable from both principal
  // service lanes rather than presenting an edge-on line from half the yard.
  cloth.rotation.y = -Math.PI / 4;
  cloth.castShadow = true;
  cloth.receiveShadow = true;
  cloth.frustumCulled = false;
  cloth.raycast = () => undefined;
  cloth.userData.rustworksFlagCloth = true;
  cloth.userData.animated = true;
  cloth.onBeforeRender = () => {
    const time = (typeof performance === 'undefined' ? Date.now() : performance.now()) * 0.001;
    const position = geometry.getAttribute('position') as THREE.BufferAttribute;
    const values = position.array as Float32Array;
    for (let index = 0; index < position.count; index += 1) {
      const offset = index * 3;
      const progress = THREE.MathUtils.clamp(basePositions[offset] / RUSTWORKS_WELSH_FLAG.width, 0, 1);
      values[offset + 2] = Math.sin(time * 2.8 + progress * Math.PI * 3.2)
        * RUSTWORKS_WELSH_FLAG.waveAmplitude * progress
        + Math.sin(time * 1.7 + progress * Math.PI * 1.3) * 0.08 * progress;
    }
    position.needsUpdate = true;
  };
  root.add(cloth);

  return root;
}
