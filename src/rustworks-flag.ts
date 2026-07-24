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

  // Four-legged passant dragon: long curled tail, raised foreleg, two wings,
  // horned head and forked tongue. The previous single body polygon read more
  // like a generic lizard than Y Ddraig Goch.
  context.fillStyle = '#ce1126';
  context.strokeStyle = '#8d0718';
  context.lineWidth = 11;
  context.lineJoin = 'round';
  context.lineCap = 'round';
  context.beginPath();
  context.moveTo(385, 350);
  context.bezierCurveTo(330, 389, 258, 407, 204, 373);
  context.bezierCurveTo(150, 338, 147, 278, 194, 245);
  context.bezierCurveTo(238, 214, 300, 230, 319, 270);
  context.bezierCurveTo(284, 250, 242, 261, 239, 291);
  context.bezierCurveTo(236, 322, 286, 340, 343, 311);
  context.bezierCurveTo(420, 270, 519, 253, 618, 272);
  context.bezierCurveTo(667, 281, 701, 264, 729, 229);
  context.lineTo(766, 190);
  context.lineTo(759, 236);
  context.lineTo(805, 208);
  context.lineTo(786, 250);
  context.lineTo(852, 260);
  context.lineTo(892, 290);
  context.lineTo(850, 307);
  context.lineTo(891, 329);
  context.lineTo(831, 333);
  context.lineTo(802, 365);
  context.lineTo(744, 344);
  context.bezierCurveTo(714, 391, 651, 409, 584, 388);
  context.lineTo(527, 362);
  context.lineTo(458, 370);
  context.bezierCurveTo(427, 374, 404, 367, 385, 350);
  context.closePath();
  context.fill();
  context.stroke();

  // Paired wings use the heraldic swept, webbed silhouette.
  context.beginPath();
  context.moveTo(432, 286);
  context.lineTo(353, 144);
  context.lineTo(476, 213);
  context.lineTo(522, 123);
  context.lineTo(560, 239);
  context.lineTo(620, 180);
  context.lineTo(599, 285);
  context.closePath();
  context.fill();
  context.stroke();
  context.beginPath();
  context.moveTo(470, 287);
  context.lineTo(448, 188);
  context.lineTo(539, 252);
  context.lineTo(583, 194);
  context.lineTo(574, 300);
  context.closePath();
  context.fill();
  context.stroke();

  // Four separate legs and splayed claws preserve the official passant pose.
  for (const [hipX, hipY, kneeX, footX, raised] of [
    [420, 352, 389, 365, false],
    [494, 359, 521, 548, false],
    [611, 374, 588, 565, false],
    [687, 353, 708, 748, true],
  ] as const) {
    context.beginPath();
    context.moveTo(hipX, hipY);
    context.lineTo(kneeX, raised ? hipY - 55 : 415);
    context.lineTo(footX, raised ? 375 : 452);
    context.lineWidth = 24;
    context.stroke();
    context.lineWidth = 9;
    const clawY = raised ? 375 : 452;
    context.beginPath();
    context.moveTo(footX, clawY);
    context.lineTo(footX - 24, clawY + 20);
    context.moveTo(footX, clawY);
    context.lineTo(footX + 4, clawY + 25);
    context.moveTo(footX, clawY);
    context.lineTo(footX + 28, clawY + 15);
    context.stroke();
  }

  // Forked tongue and facial detail.
  context.lineWidth = 9;
  context.beginPath();
  context.moveTo(876, 296);
  context.bezierCurveTo(919, 284, 944, 276, 970, 264);
  context.moveTo(944, 276);
  context.lineTo(975, 292);
  context.stroke();
  context.fillStyle = '#ffffff';
  context.beginPath();
  context.arc(833, 280, 8, 0, Math.PI * 2);
  context.fill();
  context.fillStyle = '#111111';
  context.beginPath();
  context.arc(836, 280, 3.5, 0, Math.PI * 2);
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
    dragon: 'four-legged-passant',
    legs: 4,
    wings: 2,
    tongue: 'forked',
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
