import * as THREE from 'three';
import {
  batchStaticMeshes,
  buildRetroCoach,
  buildRetroShuttleBus,
  roundedBox,
  texturedMaterial,
} from './art-kit';
import { COVER_LAYOUT, GARAGE_LAYOUT, HOUSE_LAYOUT } from './arena-layout';
import { arenaAnimationAt } from './arena-storytelling';

export type ArenaArtResult = {
  root: THREE.Group;
  loadedModels: number;
};

const LEGACY_VEHICLE_NAMES = new Set([
  'north tour bus', 'tour coach', 'coach roof', 'coach window', 'south shuttle bus', 'shuttle bus roof', 'shuttle bus window',
]);

function addTree(root: THREE.Group, x: number, z: number, scale: number): void {
  const bark = texturedMaterial('./assets/original/textures/wood-deck.png', { color: 0x80593d, roughness: 0.98, repeatY: 4 });
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.32 * scale, 0.64 * scale, 4.75 * scale, 14, 4), bark);
  trunk.position.set(x, 2.37 * scale, z);
  trunk.castShadow = true;
  root.add(trunk);
  for (const rotation of [0, Math.PI / 2, Math.PI, Math.PI * 1.5]) {
    const rootFlare = new THREE.Mesh(new THREE.CylinderGeometry(0.05 * scale, 0.2 * scale, 1.35 * scale, 8), bark);
    rootFlare.position.set(x + Math.sin(rotation) * 0.47 * scale, 0.22 * scale, z + Math.cos(rotation) * 0.47 * scale);
    rootFlare.rotation.z = Math.PI / 2.8;
    rootFlare.rotation.y = rotation;
    rootFlare.castShadow = true;
    root.add(rootFlare);
  }
  const leafMaterials = [0x3a6842, 0x527b49, 0x6f8d50, 0x829c5c].map((color) => (
    texturedMaterial('./assets/original/textures/grass-turf.png', { color, roughness: 0.92, repeatX: 1.5, repeatY: 1.5 })
  ));
  for (const [rotation, length, height] of [[-0.7, 2.3, 4.05], [0.55, 2.1, 4.25], [1.7, 1.8, 4.5], [2.65, 1.7, 4.65], [-2.4, 1.55, 4.8]] as Array<[number, number, number]>) {
    const branch = new THREE.Mesh(new THREE.CylinderGeometry(0.08 * scale, 0.17 * scale, length * scale, 9), bark);
    branch.position.set(x + Math.sin(rotation) * 0.62 * scale, height * scale, z + Math.cos(rotation) * 0.62 * scale);
    branch.rotation.z = Math.PI / 2.9; branch.rotation.y = rotation; branch.castShadow = true; root.add(branch);
  }
  const clusters: Array<[number, number, number, number, number, number]> = [
    [0, 5.55, 0, 1.95, 1.42, 1.78], [-1.38, 5.05, 0.5, 1.42, 1.08, 1.25], [1.32, 5.08, -0.42, 1.5, 1.08, 1.3],
    [-0.55, 6.3, -0.6, 1.3, 1.14, 1.2], [0.72, 6.35, 0.5, 1.4, 1.18, 1.25], [-1.42, 5.9, -0.48, 1.08, 0.88, 1.02],
    [1.5, 5.95, 0.68, 1.04, 0.86, 1], [0.05, 7.12, 0, 1.16, 1, 1.05], [0, 4.88, 1.12, 1.3, 0.94, 1.05],
    [0.98, 6.55, -0.72, 0.82, 0.72, 0.78], [-0.98, 6.6, 0.78, 0.84, 0.74, 0.8],
  ];
  clusters.forEach(([ox, oy, oz, rx, ry, rz], index) => {
    const crown = new THREE.Mesh(new THREE.SphereGeometry(scale, 12, 8), leafMaterials[index % leafMaterials.length]);
    crown.position.set(x + ox * scale, oy * scale, z + oz * scale);
    crown.scale.set(rx, ry, rz);
    crown.rotation.set(index * 0.17, index * 0.43, index * 0.11);
    crown.castShadow = index < 5;
    root.add(crown);
  });
  root.userData.pass30ModernVegetation = true;
}

function addModernGroundDetails(root: THREE.Group, reduced: boolean): void {
  const details = new THREE.Group();
  details.name = 'pass30-modern-ground-details';
  details.userData.presentationOnly = true;
  details.userData.blocksShots = false;
  const drainMaterial = texturedMaterial('./assets/original/textures/weapon-gunmetal.png', { color: 0x718089, roughness: 0.5, metalness: 0.55, repeatX: 2 });
  const drainLayout: Array<[number, number]> = reduced
    ? [[-6.6, -26], [6.6, 26]]
    : [[-6.6, -31], [6.6, -17], [-6.6, -3], [6.6, 11], [-6.6, 25], [6.6, 35]];
  const drains = new THREE.InstancedMesh(new THREE.BoxGeometry(0.75, 0.055, 1.35), drainMaterial, drainLayout.length);
  const matrix = new THREE.Matrix4();
  drainLayout.forEach(([dx, dz], index) => {
    matrix.identity().setPosition(dx, 0.07, dz);
    drains.setMatrixAt(index, matrix);
  });
  drains.instanceMatrix.needsUpdate = true;
  drains.receiveShadow = true;
  drains.userData.presentationOnly = true;
  drains.userData.blocksShots = false;
  details.add(drains);

  const reflectorMaterial = new THREE.MeshStandardMaterial({ color: 0xffa15d, emissive: 0x642008, emissiveIntensity: 0.48, roughness: 0.4, metalness: 0.2 });
  const reflectorLayout: Array<[number, number]> = [[-7.15, -30], [7.15, -20], [-7.15, -10], [7.15, 0], [-7.15, 10], [7.15, 20], [-7.15, 30], [7.15, 36]];
  const reflectors = new THREE.InstancedMesh(new THREE.BoxGeometry(0.1, 0.16, 0.34), reflectorMaterial, reduced ? 4 : reflectorLayout.length);
  reflectorLayout.slice(0, reflectors.count).forEach(([rx, rz], index) => {
    matrix.makeRotationY(index % 2 === 0 ? 0 : Math.PI).setPosition(rx, 0.14, rz);
    reflectors.setMatrixAt(index, matrix);
  });
  reflectors.instanceMatrix.needsUpdate = true;
  reflectors.userData.presentationOnly = true;
  reflectors.userData.blocksShots = false;
  details.add(reflectors);
  root.add(details);
}

function addStreetProps(root: THREE.Group): void {
  const metal = texturedMaterial('./assets/original/textures/painted-metal-teal.png', { roughness: 0.58, metalness: 0.3 });
  const concrete = texturedMaterial('./assets/original/textures/concrete-poured.png', { roughness: 0.95, repeatX: 2 });
  const hydrantRed = new THREE.MeshStandardMaterial({ color: 0xb94d38, roughness: 0.55, metalness: 0.35 });
  const shrubMaterial = new THREE.MeshStandardMaterial({ color: 0x547747, roughness: 0.96 });
  const shrubGeometry = new THREE.IcosahedronGeometry(0.54, 1);
  const lampGlow = new THREE.MeshStandardMaterial({ color: 0xffe5b5, emissive: 0xffb45b, emissiveIntensity: 2.4, roughness: 0.45 });
  for (const [x, z, rotation] of [
    [-13, -17, 0.2], [15, 19, Math.PI], [-28, 9, Math.PI / 2], [27, -11, -Math.PI / 2],
  ] as Array<[number, number, number]>) {
    const mailbox = new THREE.Group();
    mailbox.position.set(x, 0, z); mailbox.rotation.y = rotation;
    const post = roundedBox('mailbox-post', [0.16, 1.35, 0.16], concrete, 0.035); post.position.y = 0.67;
    const box = roundedBox('mailbox', [0.7, 0.48, 0.95], metal, 0.12, 4); box.position.set(0, 1.35, 0);
    mailbox.add(post, box); root.add(mailbox);
  }
  for (const [x, z] of [[-9, 15], [10, -18], [-29, -2], [29, 4]] as Array<[number, number]>) {
    const hydrant = new THREE.Group(); hydrant.position.set(x, 0, z);
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.3, 0.9, 12), hydrantRed); body.position.y = 0.45; body.castShadow = true;
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.27, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), hydrantRed); cap.position.y = 0.9;
    hydrant.add(body, cap); root.add(hydrant);
  }
  for (const [x, z] of [[-18, 10], [20, -12], [-22, -24], [22, 25]] as Array<[number, number]>) {
    const planter = roundedBox('concrete-planter', [2.2, 0.7, 1.05], concrete, 0.12); planter.position.set(x, 0.35, z); root.add(planter);
    for (const offset of [-0.6, 0, 0.6]) {
      const shrub = new THREE.Mesh(shrubGeometry, shrubMaterial);
      shrub.position.set(x + offset, 0.92 + (offset === 0 ? 0.08 : 0), z);
      shrub.scale.set(1, offset === 0 ? 1.15 : 0.86, 0.82);
      shrub.rotation.y = offset * 1.7;
      shrub.castShadow = true; root.add(shrub);
    }
  }
  for (const [x, z] of [[-13, -16], [13, 16], [-13, 22], [13, -22]] as Array<[number, number]>) {
    const direction = x < 0 ? 1 : -1;
    const arm = roundedBox('streetlamp-arm', [1.15, 0.14, 0.14], metal, 0.035, 2);
    arm.position.set(x + direction * 0.5, 5.45, z); decorative(arm); root.add(arm);
    const hood = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.19, 0.2, 10), metal);
    hood.position.set(x + direction, 5.3, z); decorative(hood); root.add(hood);
    const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.26, 0.08, 10), lampGlow);
    lens.position.set(x + direction, 5.18, z); decorative(lens); root.add(lens);
  }
}

type FaunaFlight = Readonly<{ x: number; z: number; radius: number; height: number; phase: number; speed: number }>;

export const NEIGHBOURHOOD_FLOWER_BEDS: ReadonlyArray<readonly [number, number]> = Object.freeze([
  [-21.2, -29], [-13.8, -18.2], [-27.8, 18],
  [21.2, 29], [13.8, 18.2], [27.8, -18],
]);

export const NEIGHBOURHOOD_BIN_POSITIONS: ReadonlyArray<readonly [number, number]> = Object.freeze([
  [-21.4, -33], [21.4, 33], [-14.3, 12], [14.3, -12], [-28, -34], [28, 34],
]);

export const NEIGHBOURHOOD_BICYCLE_POSITIONS: ReadonlyArray<readonly [number, number, number]> = Object.freeze([
  [-24.5, -35, 0.12], [24.5, 35, Math.PI + 0.12], [29.4, 14, Math.PI / 2],
]);

export function addNeighbourhoodLife(root: THREE.Object3D, reduced: boolean): THREE.Group {
  const group = new THREE.Group();
  group.name = 'pass31-neighbourhood-life';
  group.userData.presentationOnly = true;
  group.userData.blocksShots = false;

  const flowerCount = reduced ? 24 : 72;
  const flowerBeds = NEIGHBOURHOOD_FLOWER_BEDS;
  const stems = new THREE.InstancedMesh(
    new THREE.CylinderGeometry(0.018, 0.025, 0.42, reduced ? 3 : 5),
    new THREE.MeshLambertMaterial({ color: 0x4d7d48 }),
    flowerCount,
  );
  stems.name = 'pass31-flower-stems';
  const blooms = new THREE.InstancedMesh(
    new THREE.OctahedronGeometry(0.09, 0),
    new THREE.MeshLambertMaterial({ color: 0xf1b65f, emissive: 0x2d1608, emissiveIntensity: 0.18 }),
    flowerCount,
  );
  blooms.name = 'pass31-flower-blooms';
  const matrix = new THREE.Matrix4();
  for (let index = 0; index < flowerCount; index += 1) {
    const bed = flowerBeds[index % flowerBeds.length];
    const ring = Math.floor(index / flowerBeds.length);
    const angle = index * 2.399963229728653;
    const radius = 0.28 + (ring % 4) * 0.24;
    const x = bed[0] + Math.cos(angle) * radius;
    const z = bed[1] + Math.sin(angle) * radius * 0.62;
    const height = 0.32 + (index % 5) * 0.035;
    matrix.compose(new THREE.Vector3(x, height / 2 + 0.04, z), new THREE.Quaternion(), new THREE.Vector3(1, height / 0.42, 1));
    stems.setMatrixAt(index, matrix);
    const bloomScale = 0.82 + (index % 4) * 0.09;
    matrix.compose(new THREE.Vector3(x, height + 0.05, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(index * 0.17, angle, 0)), new THREE.Vector3(bloomScale, bloomScale, bloomScale));
    blooms.setMatrixAt(index, matrix);
    if (index % 3 === 1) blooms.setColorAt(index, new THREE.Color(0xd85f6c));
    else if (index % 3 === 2) blooms.setColorAt(index, new THREE.Color(0x79cfd0));
  }
  stems.instanceMatrix.needsUpdate = true;
  blooms.instanceMatrix.needsUpdate = true;
  stems.userData.dynamic = true;
  blooms.userData.dynamic = true;
  if (blooms.instanceColor) blooms.instanceColor.needsUpdate = true;
  decorative(stems); decorative(blooms); group.add(stems, blooms);

  const timber = texturedMaterial('./assets/original/textures/wood-deck.png', {
    color: 0x9c7450, roughness: 0.9, repeatX: 3,
    normalPath: './assets/original/textures/wood-deck-normal.png',
    roughnessPath: './assets/original/textures/wood-deck-roughness.png',
    normalScale: 0.35,
  });
  const steel = new THREE.MeshStandardMaterial({ color: 0x34484e, roughness: 0.52, metalness: 0.52 });
  const streetBox = (name: string, size: [number, number, number], material: THREE.Material): THREE.Mesh => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material);
    mesh.name = name;
    return mesh;
  };
  for (const [x, z, rotation] of [[-15.2, -7, 0], [15.2, 7, Math.PI], [-15.2, 26, 0], [15.2, -26, Math.PI]] as Array<[number, number, number]>) {
    const bench = new THREE.Group(); bench.name = 'street-bench'; bench.position.set(x, 0, z); bench.rotation.y = rotation;
    const seat = streetBox('bench-seat', [2.5, 0.16, 0.62], timber); seat.position.y = 0.72;
    const back = streetBox('bench-back', [2.5, 0.92, 0.14], timber); back.position.set(0, 1.22, 0.29); back.rotation.x = -0.1;
    for (const side of [-1, 1]) {
      const leg = streetBox('bench-leg', [0.13, 0.72, 0.42], steel); leg.position.set(side * 0.9, 0.36, 0); bench.add(leg);
    }
    bench.add(seat, back); decorative(bench); group.add(bench);
  }

  const binColors = [0x315b5e, 0x704c43, 0x3e5a45];
  for (const [index, [x, z]] of NEIGHBOURHOOD_BIN_POSITIONS.entries()) {
    const bin = streetBox('street-recycling-bin', [0.72, 1.08, 0.66], new THREE.MeshStandardMaterial({ color: binColors[index % binColors.length], roughness: 0.72, metalness: 0.18 }));
    bin.position.set(x, 0.54, z); decorative(bin); group.add(bin);
  }

  const tyre = new THREE.MeshStandardMaterial({ color: 0x151b1d, roughness: 0.88, side: THREE.DoubleSide });
  const frameMaterial = new THREE.LineBasicMaterial({ color: 0xe0ad45 });
  for (const [x, z, rotation] of NEIGHBOURHOOD_BICYCLE_POSITIONS) {
    const bicycle = new THREE.Group(); bicycle.name = 'street-bicycle'; bicycle.position.set(x, 0, z); bicycle.rotation.y = rotation;
    for (const wheelX of [-0.62, 0.62]) {
      const wheelGeometry = reduced
        ? new THREE.RingGeometry(0.31, 0.37, 6)
        : new THREE.TorusGeometry(0.36, 0.035, 6, 18);
      const wheel = new THREE.Mesh(wheelGeometry, tyre);
      wheel.position.set(wheelX, 0.4, 0); bicycle.add(wheel);
    }
    const frame = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-0.56, 0.4, 0), new THREE.Vector3(0, 0.82, 0),
      new THREE.Vector3(0, 0.82, 0), new THREE.Vector3(0.56, 0.4, 0),
      new THREE.Vector3(-0.56, 0.4, 0), new THREE.Vector3(0.25, 0.4, 0),
      new THREE.Vector3(0.25, 0.4, 0), new THREE.Vector3(0, 0.82, 0),
    ]), frameMaterial);
    bicycle.add(frame); decorative(bicycle); group.add(bicycle);
  }

  group.userData.streetBatchStats = batchStaticMeshes(group, group, () => '', 'vertex-lit');
  group.userData.neighbourhoodLife = { flowers: flowerCount, flowerBeds: flowerBeds.length, benches: 4, bins: 6, bicycles: 3, markers: 0, butterflies: 0, birds: 0 };
  root.add(group);
  return group;
}

function decorative(mesh: THREE.Object3D): THREE.Object3D {
  mesh.traverse((node) => {
    node.userData.blocksShots = false;
    if (node instanceof THREE.Mesh) {
      // Decorative facade/route dressing receives the authored world shadow but
      // does not render a second shadow-map pass of hundreds of tiny pieces.
      node.castShadow = false;
      node.receiveShadow = true;
    }
  });
  return mesh;
}

function createSignTexture(label: string): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 768; canvas.height = 180;
  const context = canvas.getContext('2d')!;
  context.fillStyle = '#21343a'; context.fillRect(0, 0, canvas.width, canvas.height);
  context.strokeStyle = '#e4bc4d'; context.lineWidth = 12; context.strokeRect(10, 10, canvas.width - 20, canvas.height - 20);
  context.fillStyle = '#f3ead5'; context.textAlign = 'center'; context.textBaseline = 'middle';
  context.font = '700 62px system-ui, sans-serif'; context.fillText(label, canvas.width / 2, canvas.height / 2 + 2);
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function addFacadeAndInteriorDressing(root: THREE.Group): void {
  const trim = new THREE.MeshStandardMaterial({ color: 0xf1e5cc, roughness: 0.68 });
  const fabricAqua = new THREE.MeshStandardMaterial({ color: 0x347a80, roughness: 0.96 });
  const fabricCoral = new THREE.MeshStandardMaterial({ color: 0x9d4f43, roughness: 0.96 });

  // House geometry is intentionally complete in createHouseArchitecture()/map.ts.
  // Keep this layer off the houses so ramps, four-room plans, door and windows
  // cannot be obscured by legacy gables, balconies, downpipes or garden walls.

  // The end garages remain separate lane anchors rather than house clutter.
  const garageRoofs = GARAGE_LAYOUT.map((garage, index) => ({
    ...garage,
    accent: index === 0 ? fabricAqua : fabricCoral,
  }));
  for (const garage of garageRoofs) {
    const garageShell = new THREE.MeshBasicMaterial({ color: garage.z < 0 ? 0x4f9fa1 : 0xb96755 });
    const facade = roundedBox('garage-facade-finish', [16, 7, 0.14], garageShell, 0.04, 2);
    const frontZ = garage.z + (garage.z < 0 ? 3.3 : -3.3);
    facade.position.set(garage.x, 3.5, frontZ);
    decorative(facade); root.add(facade);
    const gableShape = new THREE.Shape();
    gableShape.moveTo(-8, 0); gableShape.lineTo(8, 0); gableShape.lineTo(0, 6.5); gableShape.closePath();
    const gable = new THREE.Mesh(
      new THREE.ShapeGeometry(gableShape),
      new THREE.MeshBasicMaterial({ color: garage.z < 0 ? 0x4f9fa1 : 0xb96755, side: THREE.DoubleSide }),
    );
    gable.name = 'garage-gable-face';
    gable.position.set(garage.x, 7, frontZ + (garage.z < 0 ? 0.09 : -0.09));
    decorative(gable); root.add(gable);
    const sign = new THREE.Mesh(
      new THREE.PlaneGeometry(6.2, 1.35),
      new THREE.MeshBasicMaterial({ map: createSignTexture('ATOMIC SERVICE'), side: THREE.DoubleSide }),
    );
    sign.name = 'garage-service-sign';
    sign.position.set(garage.x, 7.15, frontZ + (garage.z < 0 ? 0.2 : -0.2));
    decorative(sign); root.add(sign);
    for (const offset of [-7.25, 7.25]) {
      const cornerTrim = roundedBox('garage-corner-trim', [0.24, 6.6, 0.1], trim, 0.025, 2);
      cornerTrim.position.set(garage.x + offset, 3.5, frontZ + (garage.z < 0 ? 0.18 : -0.18));
      decorative(cornerTrim); root.add(cornerTrim);
    }
    const doorFinish = roundedBox('garage-door-finish', [10.2, 3.35, 0.06], trim, 0.04, 2);
    doorFinish.position.set(garage.x, 2.05, frontZ + (garage.z < 0 ? 0.12 : -0.12));
    decorative(doorFinish); root.add(doorFinish);
    const doorSlatMaterial = new THREE.MeshBasicMaterial({ color: 0x718286 });
    for (const y of [0.9, 1.65, 2.4, 3.15]) {
      const slat = roundedBox('garage-door-slat', [9.8, 0.08, 0.04], doorSlatMaterial, 0.015, 1);
      slat.position.set(garage.x, y, frontZ + (garage.z < 0 ? 0.16 : -0.16));
      decorative(slat); root.add(slat);
    }
    for (const side of [-1, 1]) {
      const roof = roundedBox('garage-pitched-roof', [6.35, 0.34, 7.1], garage.accent, 0.06, 2);
      roof.position.set(garage.x + side * 2.82, 4.08, garage.z);
      roof.rotation.z = side * 0.28;
      decorative(roof); root.add(roof);
    }
  }
}

function addStreetInfrastructure(root: THREE.Group): void {
  const steel = new THREE.MeshStandardMaterial({ color: 0x39484d, roughness: 0.56, metalness: 0.56 });
  const porcelain = new THREE.MeshStandardMaterial({ color: 0xd7d0bd, roughness: 0.42 });
  const cable = new THREE.LineBasicMaterial({ color: 0x20292c, transparent: true, opacity: 0.72 });
  const polePositions: Array<[number, number]> = [[-29, -35], [-29, 0], [-29, 35], [29, -35], [29, 0], [29, 35]];
  for (const [x, z] of polePositions) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.25, 9.6, 10), steel);
    pole.position.set(x, 4.8, z); decorative(pole); root.add(pole);
    const crossbar = roundedBox('utility-crossbar', [2.65, 0.16, 0.18], steel, 0.035);
    crossbar.position.set(x, 8.75, z); decorative(crossbar); root.add(crossbar);
    for (const offset of [-1, 0, 1]) {
      const insulator = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.12, 0.32, 8), porcelain);
      insulator.position.set(x + offset, 9.02, z); decorative(insulator); root.add(insulator);
    }
  }
  const wireSegments: THREE.Vector3[] = [];
  for (const x of [-29, 29]) {
    for (const offset of [-1, 0, 1]) {
      for (const [fromZ, toZ] of [[-35, 0], [0, 35]] as Array<[number, number]>) {
        let previous = new THREE.Vector3(x + offset, 9.02, fromZ);
        for (let segment = 1; segment <= 12; segment += 1) {
          const t = segment / 12;
          const sag = Math.sin(Math.PI * t) * 0.65;
          const current = new THREE.Vector3(x + offset, 9.02 - sag, THREE.MathUtils.lerp(fromZ, toZ, t));
          wireSegments.push(previous, current);
          previous = current;
        }
      }
    }
  }
  const wires = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(wireSegments), cable);
  decorative(wires); root.add(wires);

  const signMaterial = new THREE.MeshStandardMaterial({ color: 0xe7b542, roughness: 0.48, metalness: 0.28 });
  for (const [x, z, rotation] of [[-11.3, -6, 0], [11.3, 6, Math.PI]] as Array<[number, number, number]>) {
    const gantry = new THREE.Group(); gantry.position.set(x, 0, z); gantry.rotation.y = rotation;
    const post = roundedBox('lane-sign-post', [0.15, 4.2, 0.15], steel, 0.025); post.position.y = 2.1;
    const plate = roundedBox('lane-sign', [3.2, 0.92, 0.12], signMaterial, 0.08); plate.position.set(0, 3.65, 0);
    gantry.add(post, plate); decorative(gantry); root.add(gantry);
  }
}

function addAtomicLandmark(root: THREE.Group): void {
  const landmark = new THREE.Group();
  landmark.name = 'original-atomic-landmark';
  landmark.position.set(27, 0, -1.5);
  const ringMaterial = new THREE.MeshStandardMaterial({ color: 0x54c8c7, emissive: 0x123b42, emissiveIntensity: 1.2, roughness: 0.36, metalness: 0.64 });
  const animationRings: THREE.Mesh[] = [];
  for (const [index, rotation] of [0, Math.PI / 3, -Math.PI / 3].entries()) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(2.25, 0.13, 10, 42), ringMaterial);
    ring.name = `animated-atomic-ring-${index}`;
    ring.userData.dynamic = true;
    ring.position.y = 3.25; ring.rotation.set(Math.PI / 2, rotation, rotation * 0.45); landmark.add(ring);
    animationRings.push(ring);
  }
  const nucleus = new THREE.Mesh(new THREE.IcosahedronGeometry(0.62, 2), new THREE.MeshStandardMaterial({ color: 0xffc851, emissive: 0xb85b13, emissiveIntensity: 1.6, roughness: 0.32 }));
  nucleus.name = 'animated-atomic-nucleus';
  nucleus.userData.dynamic = true;
  nucleus.position.y = 3.25; landmark.add(nucleus);
  root.userData.animationRings = animationRings;
  root.userData.animationNucleus = nucleus;
  decorative(landmark); root.add(landmark);
}

function addRouteArchitecture(root: THREE.Group): void {
  const frame = new THREE.MeshStandardMaterial({ color: 0x26343a, roughness: 0.42, metalness: 0.68 });
  const trim = new THREE.MeshStandardMaterial({ color: 0xe5bd4b, roughness: 0.52, metalness: 0.32 });
  const concrete = texturedMaterial('./assets/original/textures/concrete-poured.png', { roughness: 0.9, repeatX: 2, repeatY: 4 });
  const glass = new THREE.MeshPhysicalMaterial({ color: 0x7fc6c3, transparent: true, opacity: 0.32, roughness: 0.18, metalness: 0.08, depthWrite: false });
  const solar = new THREE.MeshStandardMaterial({ color: 0x173d58, emissive: 0x071d2c, emissiveIntensity: 0.7, roughness: 0.3, metalness: 0.72 });
  const vineMaterial = new THREE.MeshStandardMaterial({ color: 0x496f47, roughness: 0.96 });
  const vineGeometry = new THREE.IcosahedronGeometry(0.46, 1);
  const routeBox = (name: string, size: [number, number, number], material: THREE.Material, radius: number) => roundedBox(name, size, material, radius, 2);
  const routePanel = (name: string, size: [number, number, number], material: THREE.Material) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material);
    mesh.name = name;
    return mesh;
  };

  // West "skyline garden" route: a folded trellis reveal leading into a framed greenhouse.
  for (const x of [-29, -22]) for (const z of [-15, -5]) {
    const column = routeBox('trellis-column', [0.55, 3.8, 0.55], frame, 0.08);
    column.position.set(x, 1.9, z); decorative(column); root.add(column);
  }
  for (const z of [-15, -11.7, -8.3, -5]) {
    const rib = routeBox('trellis-rib', [8.1, 0.22, 0.36], frame, 0.05);
    rib.position.set(-25.5, 4.0, z); decorative(rib); root.add(rib);
  }
  for (const x of [-28.5, -27, -25.5, -24, -22.5]) {
    const slat = routeBox('trellis-slat', [0.18, 0.16, 10.8], trim, 0.04);
    slat.position.set(x, 4.08, -10); decorative(slat); root.add(slat);
  }
  for (const [x, y, z, scale] of [
    [-28.7, 4.08, -14.2, 1.05], [-27.1, 4.16, -12.1, 0.82], [-25.5, 4.1, -9.5, 1.1],
    [-23.7, 4.05, -6.4, 0.9], [-22.35, 3.92, -13.7, 0.78], [-27.8, 3.98, -6.1, 0.84],
  ] as Array<[number, number, number, number]>) {
    const vine = new THREE.Mesh(vineGeometry, vineMaterial);
    vine.name = 'trellis-vine-cluster';
    vine.position.set(x, y, z);
    vine.scale.set(scale * 1.3, scale * 0.52, scale * 1.45);
    vine.rotation.set(x * 0.07, z * 0.11, y * 0.09);
    decorative(vine); root.add(vine);
  }

  for (const [x, z, sx, sz] of [
    [-29, 16, 0.45, 8], [-22, 16, 0.45, 8], [-25.5, 19.8, 7.5, 0.45],
    [-28, 12.2, 2.2, 0.45], [-23, 12.2, 2.2, 0.45],
  ] as Array<[number, number, number, number]>) {
    const sill = routeBox('greenhouse-frame-wall', [sx, 3, sz], frame, 0.08);
    sill.position.set(x, 1.5, z); decorative(sill); root.add(sill);
  }
  for (const x of [-27.7, -25.5, -23.3]) {
    const roof = routeBox('greenhouse-roof-rib', [0.18, 0.18, 8.4], trim, 0.04);
    roof.position.set(x, 3.45, 16); roof.rotation.z = x < -25.5 ? -0.22 : x > -25.5 ? 0.22 : 0; decorative(roof); root.add(roof);
  }
  for (const x of [-27.2, -23.8]) {
    const pane = routeBox('greenhouse-glass', [2.8, 0.08, 8], glass, 0.02);
    pane.position.set(x, 3.5, 16); pane.rotation.z = x < -25.5 ? -0.22 : 0.22; decorative(pane); root.add(pane);
  }
  for (const [x, z] of [[-28, 14], [-25.5, 18], [-23, 14]] as Array<[number, number]>) {
    const planter = routeBox('greenhouse-planter', [1.5, 0.55, 0.8], concrete, 0.12);
    planter.position.set(x, 0.28, z); decorative(planter); root.add(planter);
  }

  // East "service lane": waist-high channel walls and a folded solar maintenance canopy.
  for (const x of [22.5, 28.5]) {
    const wall = routeBox('service-channel-wall', [0.7, 1.5, 10], concrete, 0.12);
    wall.position.set(x, 0.75, 9); decorative(wall); root.add(wall);
    for (const z of [6, 9, 12]) {
      const marker = routeBox('service-marker', [0.78, 0.16, 1.35], trim, 0.03);
      marker.position.set(x, 1.18, z); decorative(marker); root.add(marker);
    }
  }
  for (const x of [22.5, 29.5]) for (const z of [-20, -12]) {
    const column = routeBox('solar-column', [0.6, 4.2, 0.6], frame, 0.08);
    column.position.set(x, 2.1, z); decorative(column); root.add(column);
  }
  const canopy = routeBox('solar-canopy', [8.2, 0.34, 9.2], solar, 0.12);
  canopy.position.set(26, 4.45, -16); canopy.rotation.z = -0.08; decorative(canopy); root.add(canopy);
  for (const x of [23.3, 25.1, 26.9, 28.7]) {
    const seam = routeBox('solar-seam', [0.06, 0.04, 8.5], trim, 0.01);
    seam.position.set(x, 4.66 + (26 - x) * 0.08, -16); seam.rotation.z = -0.08; decorative(seam); root.add(seam);
  }

  // Layered modular lane barriers retain the exact invisible gameplay box while losing the blockout-cube silhouette.
  COVER_LAYOUT.forEach(([x, z, width, depth], index) => {
    if (index === 4) {
      const cargo = new THREE.Group(); cargo.name = 'north-authored-cargo-stack';
      for (const [cx, cy, cz, sx, sy, sz] of [
        [-0.95, 0.62, 0, 1.72, 1.18, 1.78], [0.95, 0.62, 0, 1.72, 1.18, 1.78], [0, 1.65, 0, 1.72, 0.86, 1.78],
      ] as Array<[number, number, number, number, number, number]>) {
        const crate = routeBox('cargo-crate', [sx, sy, sz], concrete, 0.1);
        crate.position.set(cx, cy, cz); cargo.add(crate);
        for (const band of [-0.42, 0.42]) {
          const strap = routeBox('cargo-ratchet-strap', [0.1, sy + 0.04, sz + 0.04], trim, 0.02);
          strap.position.set(cx + band, cy, cz); cargo.add(strap);
        }
      }
      cargo.position.set(x, 0, z); decorative(cargo); root.add(cargo);
    } else if (index === 5) {
      const pipes = new THREE.Group(); pipes.name = 'south-authored-pipe-stack';
      for (const [offsetX, y] of [[-0.9, 0.62], [0, 0.62], [0.9, 0.62], [-0.45, 1.48], [0.45, 1.48]] as Array<[number, number]>) {
        const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.43, 0.43, Math.max(1.2, width - 0.3), 16, 1, true), concrete);
        pipe.name = 'stacked-concrete-pipe';
        pipe.position.set(offsetX, y, 0); pipe.rotation.z = Math.PI / 2; pipes.add(pipe);
      }
      pipes.position.set(x, 0, z); decorative(pipes); root.add(pipes);
    } else if (index === 6) {
      const skip = new THREE.Group(); skip.name = 'west-authored-service-skip'; skip.position.set(x, 0, z);
      const body = routeBox('service-skip-body', [width - 0.12, 1.72, depth - 0.18], concrete, 0.16);
      body.position.y = 0.91; skip.add(body);
      for (const side of [-1, 1]) {
        const rail = routeBox('service-skip-rim', [width + 0.08, 0.14, 0.18], trim, 0.035);
        rail.position.set(0, 1.82, side * (depth / 2 - 0.12)); skip.add(rail);
      }
      const label = routeBox('service-skip-warning-panel', [width - 0.45, 0.5, 0.06], trim, 0.03);
      label.position.set(0, 1.05, depth / 2); skip.add(label); decorative(skip); root.add(skip);
    } else if (index === 7) {
      const generator = new THREE.Group(); generator.name = 'east-authored-generator-trailer'; generator.position.set(x, 0, z);
      const shell = routeBox('generator-shell', [width - 0.18, 1.72, depth - 0.42], frame, 0.14);
      shell.position.y = 1.1; generator.add(shell);
      const roof = routeBox('generator-roof', [width, 0.18, depth - 0.18], trim, 0.06);
      roof.position.y = 2.02; generator.add(roof);
      for (const side of [-1, 0, 1]) {
        const vent = routePanel('generator-vent', [width - 0.5, 0.08, 0.06], trim);
        vent.position.set(0, 0.82 + side * 0.28, depth / 2 - 0.17); generator.add(vent);
      }
      for (const zWheel of [-depth * 0.3, depth * 0.3]) {
        const tyre = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, width + 0.08, 14), frame);
        tyre.name = 'generator-trailer-wheel'; tyre.rotation.z = Math.PI / 2; tyre.position.set(0, 0.44, zWheel); generator.add(tyre);
      }
      decorative(generator); root.add(generator);
    }
    const cap = routeBox('barrier-cap', [width + 0.18, 0.16, depth + 0.18], index % 2 ? trim : frame, 0.05);
    cap.position.set(x, 1.58, z); decorative(cap); root.add(cap);
    for (const side of [-1, 1]) {
      const rib = routeBox('barrier-rib', [0.12, 1.18, depth + 0.1], frame, 0.03);
      rib.position.set(x + side * (width / 2 - 0.18), 0.78, z); decorative(rib); root.add(rib);
      const foot = routePanel('barrier-foot', [0.48, 0.14, depth + 0.34], frame);
      foot.position.set(x + side * (width / 2 - 0.34), 0.08, z); decorative(foot); root.add(foot);
    }
    for (const face of [-1, 1]) {
      const faceZ = z + face * (depth / 2 + 0.035);
      const panel = routePanel('barrier-recessed-panel', [Math.max(0.7, width - 0.48), 0.92, 0.07], frame);
      panel.position.set(x, 0.78, faceZ); decorative(panel); root.add(panel);
      for (const side of [-1, 1]) {
        const warning = routePanel('barrier-warning-stripe', [Math.max(0.42, width * 0.29), 0.13, 0.075], trim);
        warning.position.set(x + side * width * 0.21, 0.8, faceZ + face * 0.006);
        warning.rotation.z = side * 0.48;
        decorative(warning); root.add(warning);
      }
    }
  });
}

function addSemanticHouseInteriors(root: THREE.Group): void {
  const interiors = new THREE.Group();
  interiors.name = 'performance-interior-furnishing-sets';
  const fabric = texturedMaterial('./assets/original/textures/fabric-weave.png', {
    color: 0xc8d2c4,
    roughness: 0.96,
    repeatX: 2,
    repeatY: 2,
    normalPath: './assets/original/textures/fabric-weave-normal.png',
    roughnessPath: './assets/original/textures/fabric-weave-roughness.png',
    normalScale: 0.42,
  });
  fabric.name = 'interior-fabric-upholstery';
  const timber = texturedMaterial('./assets/original/textures/wood-deck.png', {
    color: 0xa67952,
    roughness: 0.9,
    repeatX: 3,
    repeatY: 2,
    normalPath: './assets/original/textures/wood-deck-normal.png',
    roughnessPath: './assets/original/textures/wood-deck-roughness.png',
    normalScale: 0.34,
  });
  timber.name = 'interior-timber-furniture';
  const darkEquipment = texturedMaterial('./assets/original/textures/weapon-gunmetal.png', {
    color: 0x39474d,
    roughness: 0.54,
    metalness: 0.34,
    repeatX: 2,
    normalPath: './assets/original/textures/weapon-gunmetal-normal.png',
    roughnessPath: './assets/original/textures/weapon-gunmetal-roughness.png',
    normalScale: 0.26,
  });
  darkEquipment.name = 'interior-dark-media-equipment';
  const metal = texturedMaterial('./assets/original/textures/painted-metal-teal.png', {
    color: 0x6f8e8c,
    roughness: 0.62,
    metalness: 0.42,
    normalPath: './assets/original/textures/painted-metal-teal-normal.png',
    roughnessPath: './assets/original/textures/painted-metal-teal-roughness.png',
    normalScale: 0.25,
  });
  metal.name = 'interior-painted-metal-accents';

  const addPiece = (
    houseIndex: number,
    house: (typeof HOUSE_LAYOUT)[number],
    name: string,
    localPosition: [number, number, number],
    size: [number, number, number],
    material: THREE.Material,
    family: 'fabric' | 'timber' | 'dark-equipment' | 'metal',
  ): THREE.Mesh => {
    const piece = new THREE.Mesh(new THREE.BoxGeometry(...size), material);
    piece.name = `performance-interior-${houseIndex}-${name}`;
    piece.position.set(
      house.x + localPosition[0],
      localPosition[1],
      house.z + house.facing * localPosition[2],
    );
    piece.userData.interiorMaterialFamily = family;
    piece.userData.presentationOnly = true;
    piece.userData.blocksShots = false;
    interiors.add(piece);
    return piece;
  };

  HOUSE_LAYOUT.forEach((house, houseIndex) => {
    const safeSide = house.team === 0 ? -1 : 1;
    const safeX = safeSide * 5.8;
    addPiece(houseIndex, house, 'dining-table', [safeX, 0.86, 3.9], [2.7, 0.18, 1.25], timber, 'timber');
    for (const side of [-1, 1]) {
      addPiece(houseIndex, house, `dining-chair-${side}`, [safeX + side * 1.65, 0.52, 3.9], [0.62, 1.04, 0.62], timber, 'timber');
    }

    addPiece(houseIndex, house, 'sofa-seat', [safeX, 0.48, -3.8], [3.1, 0.56, 1.28], fabric, 'fabric');
    addPiece(houseIndex, house, 'sofa-back', [safeX, 1.08, -4.3], [3.1, 1.25, 0.3], fabric, 'fabric');
    for (const side of [-1, 1]) {
      addPiece(houseIndex, house, `sofa-arm-${side}`, [safeX + side * 1.45, 0.78, -3.8], [0.24, 0.76, 1.3], fabric, 'fabric');
    }
    addPiece(houseIndex, house, 'media-console', [-safeX, 0.52, -4.45], [2.5, 0.88, 0.56], darkEquipment, 'dark-equipment');
    addPiece(houseIndex, house, 'media-screen', [-safeX, 1.55, -4.65], [2.15, 1.25, 0.14], darkEquipment, 'dark-equipment');

    addPiece(houseIndex, house, 'bed-frame', [safeX, 3.78, 3.7], [3.25, 0.28, 2.3], timber, 'timber');
    addPiece(houseIndex, house, 'bed-mattress', [safeX, 4.08, 3.7], [3.05, 0.4, 2.1], fabric, 'fabric');
    addPiece(houseIndex, house, 'bed-pillow', [safeX, 4.42, 4.35], [1.55, 0.24, 0.62], fabric, 'fabric');

    addPiece(houseIndex, house, 'shelving-body', [safeX * 1.42, 4.72, -4.5], [1.3, 2.45, 0.42], timber, 'timber');
    for (const shelfY of [3.85, 4.65, 5.45]) {
      addPiece(houseIndex, house, `shelf-${shelfY}`, [safeX * 1.42, shelfY, -4.23], [1.2, 0.11, 0.48], timber, 'timber');
    }
    addPiece(houseIndex, house, 'workstation-desk', [safeX, 3.95, -3.55], [2.5, 0.18, 1.05], timber, 'timber');
    addPiece(houseIndex, house, 'workstation-monitor', [safeX, 4.75, -3.98], [1.35, 0.88, 0.12], darkEquipment, 'dark-equipment');
    addPiece(houseIndex, house, 'workstation-leg-left', [safeX - 0.95, 3.55, -3.55], [0.13, 0.82, 0.72], metal, 'metal');
    addPiece(houseIndex, house, 'workstation-leg-right', [safeX + 0.95, 3.55, -3.55], [0.13, 0.82, 0.72], metal, 'metal');
  });

  root.add(interiors);
  const batchStats = batchStaticMeshes(interiors, interiors, () => '', 'texture-lit');
  interiors.userData.dynamic = true;
  interiors.userData.semanticInterior = {
    houses: HOUSE_LAYOUT.length,
    sourcePieces: batchStats.sourceMeshes,
    batches: batchStats.batches,
    materialFamilies: ['fabric', 'timber', 'dark-equipment', 'metal'],
  };
}

function addNarrativeDressing(root: THREE.Group, reduced: boolean): void {
  addSemanticHouseInteriors(root);
  const dark = new THREE.MeshStandardMaterial({ color: 0x25343a, roughness: 0.62, metalness: 0.28 });
  const gold = new THREE.MeshStandardMaterial({ color: 0xe5b842, emissive: 0x6b4210, emissiveIntensity: 0.5, roughness: 0.52, metalness: 0.2 });
  const routeMarkers: Array<[string, number, number, number, number]> = [
    ['VERDANT ARRAY', -19.2, 2.7, -8, Math.PI / 2],
    ['CIVIC TRANSIT', 7.4, 2.7, 0, -Math.PI / 2],
    ['HELIO SERVICE', 19.2, 2.7, 8, -Math.PI / 2],
  ];
  for (const [label, x, y, z, rotation] of routeMarkers) {
    const marker = new THREE.Group(); marker.name = `route-marker-${label.toLowerCase().replaceAll(' ', '-')}`;
    marker.position.set(x, 0, z); marker.rotation.y = rotation;
    const post = roundedBox('route-story-post', [0.16, y * 2, 0.16], dark, 0.03, 2); post.position.y = y;
    marker.add(post);
    if (reduced) {
      const plate = roundedBox('route-story-plate', [2.7, 0.68, 0.12], gold, 0.06, 2); plate.position.y = y * 1.72; marker.add(plate);
    } else {
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(4.3, 1.05), new THREE.MeshBasicMaterial({ map: createSignTexture(label), side: THREE.DoubleSide }));
      sign.name = 'route-story-sign'; sign.position.y = y * 1.72; marker.add(sign);
    }
    decorative(marker); root.add(marker);
  }

  if (reduced) return;
  for (const house of HOUSE_LAYOUT) {
    const facing = house.facing;
    const plaque = new THREE.Mesh(
      new THREE.PlaneGeometry(3.7, 0.85),
      new THREE.MeshBasicMaterial({ map: createSignTexture(house.team === 0 ? 'AQUA MODEL HOME' : 'CORAL MODEL HOME'), side: THREE.DoubleSide }),
    );
    plaque.name = 'model-home-plaque';
    plaque.position.set(house.x, 3.2, house.z + facing * 7.72);
    if (facing < 0) plaque.rotation.y = Math.PI;
    decorative(plaque); root.add(plaque);
  }
}

/** Updates only explicitly presentation-only arena nodes. */
export function updateArenaArt(root: THREE.Group, now: number): void {
  const state = arenaAnimationAt(now);
  const rings = (root.userData.animationRings as THREE.Mesh[] | undefined) ?? [];
  rings.forEach((ring, index) => {
    ring.rotation.y = state.landmarkYaw * (index % 2 === 0 ? 1 : -1) + index * Math.PI / 3;
  });
  const nucleus = root.userData.animationNucleus as THREE.Object3D | undefined;
  if (nucleus) nucleus.scale.setScalar(0.96 + state.beaconPulse * 0.08);
  const beacon = root.userData.animationBeacon as THREE.Mesh | undefined;
  if (beacon) {
    beacon.scale.setScalar(0.86 + state.beaconPulse * 0.22);
    const material = beacon.material;
    if (material instanceof THREE.MeshStandardMaterial) material.emissiveIntensity = 1.7 + state.beaconPulse * 2;
  }
  const updateFlights = (mesh: THREE.InstancedMesh | undefined, flights: FaunaFlight[], flutter: boolean): void => {
    if (!mesh) return;
    const seconds = now * 0.001;
    const matrix = new THREE.Matrix4();
    for (const [index, flight] of flights.entries()) {
      const angle = flight.phase + seconds * flight.speed;
      const position = new THREE.Vector3(
        flight.x + Math.cos(angle) * flight.radius,
        flight.height + Math.sin(angle * (flutter ? 3.7 : 1.9)) * (flutter ? 0.18 : 0.6),
        flight.z + Math.sin(angle) * flight.radius,
      );
      const rotation = new THREE.Quaternion().setFromEuler(new THREE.Euler(
        flutter ? Math.sin(angle * 8) * 0.25 : 0,
        -angle + Math.PI / 2,
        flutter ? Math.sin(angle * 12) * 0.45 : Math.sin(angle * 2) * 0.12,
      ));
      const pulse = flutter ? 0.72 + Math.abs(Math.sin(angle * 11)) * 0.55 : 1;
      matrix.compose(position, rotation, new THREE.Vector3(pulse, 1, pulse));
      mesh.setMatrixAt(index, matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  };
  updateFlights(root.userData.animationButterflies as THREE.InstancedMesh | undefined, (root.userData.butterflyFlights as FaunaFlight[] | undefined) ?? [], true);
  updateFlights(root.userData.animationBirds as THREE.InstancedMesh | undefined, (root.userData.birdFlights as FaunaFlight[] | undefined) ?? [], false);
}

/** Builds original Atomic Acres hero vehicles and environmental props. */
export async function loadArenaArt(
  scene: THREE.Scene,
  onProgress?: (loaded: number, total: number) => void,
  reducedDetail = false,
): Promise<ArenaArtResult> {
  const reduced = reducedDetail || new URLSearchParams(window.location.search).get('render') === 'compat';
  scene.traverse((node) => {
    if (LEGACY_VEHICLE_NAMES.has(node.name) || node.name === 'primitive-tree') node.visible = false;
    if (node.userData.collisionProxy === true) node.visible = false;
  });

  const root = new THREE.Group();
  root.name = 'original-arena-art';
  scene.add(root);

  addNarrativeDressing(root, reduced);
  const coach = buildRetroCoach();
  coach.position.set(-3.8, 0, 7);
  coach.rotation.y = 0.03;
  coach.traverse((node) => { node.userData.blocksShots = true; });
  root.add(coach);
  onProgress?.(1, 12);

  const shuttle = buildRetroShuttleBus();
  shuttle.position.set(4.2, 0, -8.8);
  shuttle.traverse((node) => { node.userData.blocksShots = true; });
  root.add(shuttle);
  onProgress?.(2, 12);

  addTree(root, -29, -23, 1.05); onProgress?.(3, 12);
  addTree(root, 29, 24, 1.1); onProgress?.(4, 12);
  addTree(root, -28, 29, 0.82); onProgress?.(5, 12);
  addTree(root, 27, -31, 0.9); onProgress?.(6, 12);
  addStreetProps(root); onProgress?.(7, 12);
  addModernGroundDetails(root, reduced);

  const tower = new THREE.Group();
  tower.position.set(29, 0, -36);
  const steel = new THREE.MeshStandardMaterial({ color: 0x4c5960, roughness: 0.48, metalness: 0.55 });
  for (const x of [-1.4, 1.4]) for (const z of [-1.4, 1.4]) {
    const leg = roundedBox('test-tower-leg', [0.22, 9, 0.22], steel, 0.04); leg.position.set(x, 4.5, z); tower.add(leg);
  }
  for (let y = 1; y < 9; y += 1.6) {
    for (const rotation of [0, Math.PI / 2]) {
      const brace = roundedBox('test-tower-brace', [3.2, 0.12, 0.12], steel, 0.025); brace.position.y = y; brace.rotation.y = rotation; tower.add(brace);
    }
  }
  const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.35, 16, 12), new THREE.MeshStandardMaterial({ color: 0xff6b4f, emissive: 0xff2a16, emissiveIntensity: 3 }));
  beacon.name = 'animated-test-beacon';
  beacon.userData.dynamic = true;
  root.userData.animationBeacon = beacon;
  beacon.position.y = 9.2; tower.add(beacon); decorative(tower); root.add(tower); onProgress?.(8, 12);

  if (!reduced) {
    addFacadeAndInteriorDressing(root); onProgress?.(9, 12);
    addStreetInfrastructure(root); onProgress?.(10, 12);
    addRouteArchitecture(root);
    addAtomicLandmark(root); onProgress?.(11, 12);
  } else {
    onProgress?.(9, 12); onProgress?.(10, 12); onProgress?.(11, 12);
  }
  root.traverse((node) => {
    if (node.userData.blocksShots === undefined) node.userData.blocksShots = false;
  });
  onProgress?.(12, 12);

  return { root, loadedModels: 12 };
}
