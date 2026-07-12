import * as THREE from 'three';
import {
  buildRetroCoach,
  buildRetroDeliveryTruck,
  roundedBox,
  texturedMaterial,
} from './art-kit';
import { COVER_LAYOUT, GARAGE_LAYOUT, HOUSE_LAYOUT } from './arena-layout';

export type ArenaArtResult = {
  root: THREE.Group;
  loadedModels: number;
};

const LEGACY_VEHICLE_NAMES = new Set([
  'tour coach', 'coach roof', 'coach window', 'delivery truck', 'truck cab', 'truck windshield',
]);

function addTree(root: THREE.Group, x: number, z: number, scale: number): void {
  const bark = texturedMaterial('./assets/original/textures/wood-deck.png', { color: 0x72503b, roughness: 1, repeatY: 3 });
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.38 * scale, 0.55 * scale, 4.2 * scale, 12), bark);
  trunk.position.set(x, 2.1 * scale, z);
  trunk.castShadow = true;
  root.add(trunk);
  const leafMaterials = [0x35583d, 0x496f47, 0x5f8249, 0x789454].map((color) => new THREE.MeshStandardMaterial({ color, roughness: 0.96 }));
  for (const [rotation, length] of [[-0.7, 2.2], [0.55, 2.0], [1.7, 1.65]] as Array<[number, number]>) {
    const branch = new THREE.Mesh(new THREE.CylinderGeometry(0.1 * scale, 0.18 * scale, length * scale, 8), bark);
    branch.position.set(x + Math.sin(rotation) * 0.55 * scale, 3.9 * scale, z + Math.cos(rotation) * 0.55 * scale);
    branch.rotation.z = Math.PI / 2.9; branch.rotation.y = rotation; branch.castShadow = true; root.add(branch);
  }
  const clusters: Array<[number, number, number, number, number, number]> = [
    [0, 5.35, 0, 1.85, 1.35, 1.7], [-1.3, 4.85, 0.45, 1.35, 1.05, 1.2], [1.25, 4.95, -0.35, 1.45, 1.05, 1.25],
    [-0.5, 6.15, -0.55, 1.25, 1.1, 1.15], [0.65, 6.2, 0.45, 1.35, 1.15, 1.2], [-1.35, 5.75, -0.45, 1.05, 0.85, 1.0],
    [1.45, 5.8, 0.65, 1.0, 0.82, 0.95], [0.05, 6.95, 0, 1.1, 0.95, 1.0], [0, 4.7, 1.05, 1.25, 0.9, 1.0],
  ];
  clusters.forEach(([ox, oy, oz, rx, ry, rz], index) => {
    const crown = new THREE.Mesh(new THREE.IcosahedronGeometry(scale, 2), leafMaterials[index % leafMaterials.length]);
    crown.position.set(x + ox * scale, oy * scale, z + oz * scale);
    crown.scale.set(rx, ry, rz);
    crown.rotation.set(index * 0.17, index * 0.43, index * 0.11);
    crown.castShadow = index < 5;
    root.add(crown);
  });
}

function addStreetProps(root: THREE.Group): void {
  const metal = texturedMaterial('./assets/original/textures/painted-metal-teal.png', { roughness: 0.58, metalness: 0.3 });
  const concrete = texturedMaterial('./assets/original/textures/concrete-poured.png', { roughness: 0.95, repeatX: 2 });
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
    const red = new THREE.MeshStandardMaterial({ color: 0xb94d38, roughness: 0.55, metalness: 0.35 });
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.3, 0.9, 16), red); body.position.y = 0.45; body.castShadow = true;
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.27, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), red); cap.position.y = 0.9;
    hydrant.add(body, cap); root.add(hydrant);
  }
  for (const [x, z] of [[-18, 10], [20, -12], [-22, -24], [22, 25]] as Array<[number, number]>) {
    const planter = roundedBox('concrete-planter', [2.2, 0.7, 1.05], concrete, 0.12); planter.position.set(x, 0.35, z); root.add(planter);
    for (const offset of [-0.6, 0, 0.6]) {
      const shrub = new THREE.Mesh(new THREE.IcosahedronGeometry(0.54, 2), new THREE.MeshStandardMaterial({ color: 0x547747, roughness: 0.96 }));
      shrub.position.set(x + offset, 0.88, z); shrub.castShadow = true; root.add(shrub);
    }
  }
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
  const dark = texturedMaterial('./assets/original/textures/weapon-gunmetal.png', { roughness: 0.62, metalness: 0.22 });
  const timber = texturedMaterial('./assets/original/textures/wood-deck.png', { roughness: 0.9, repeatX: 3 });
  const fabricAqua = new THREE.MeshStandardMaterial({ color: 0x347a80, roughness: 0.96 });
  const fabricCoral = new THREE.MeshStandardMaterial({ color: 0x9d4f43, roughness: 0.96 });
  const shellAqua = new THREE.MeshBasicMaterial({ color: 0x4f9fa1 });
  const shellCoral = new THREE.MeshBasicMaterial({ color: 0xb96755 });
  const interiorWall = new THREE.MeshStandardMaterial({
    color: 0xcbbf9f,
    emissive: 0x3b3020,
    emissiveIntensity: 0.32,
    roughness: 0.92,
  });

  for (const layout of HOUSE_LAYOUT) {
    const house = {
      ...layout,
      fabric: layout.team === 0 ? fabricAqua : fabricCoral,
      shell: layout.team === 0 ? shellAqua : shellCoral,
    };
    const frontZ = house.z + house.facing * 7.48;
    const backZ = house.z - house.facing * 7.55;

    // Slightly offset exterior finish guarantees the hero houses keep their team colour at long range.
    for (const [offset, width] of [[-5.2, 5.8], [5.2, 5.8], [-6.3, 3.6], [0, 3.4], [6.3, 3.6]] as Array<[number, number]>) {
      const upper = Math.abs(offset) < 7 && width <= 3.6;
      const panel = roundedBox('house-colour-finish', [width, upper ? 3.5 : 3.15, 0.12], house.shell, 0.025, 2);
      panel.position.set(house.x + offset, upper ? 5.45 : 1.65, frontZ + house.facing * 0.26);
      decorative(panel); root.add(panel);
    }
    for (const side of [-1, 1]) {
      const roofFinish = roundedBox('house-roof-finish', [9.2, 0.26, 15.7], house.shell, 0.045, 2);
      roofFinish.position.set(house.x + side * 4.15, 8.2, house.z);
      roofFinish.rotation.z = side * 0.24;
      decorative(roofFinish); root.add(roofFinish);
    }
    const upperFacade = roundedBox('house-upper-facade-finish', [15.75, 3.5, 0.13], house.shell, 0.025, 2);
    upperFacade.position.set(house.x, 5.45, frontZ + house.facing * 0.35);
    decorative(upperFacade); root.add(upperFacade);
    const gableShape = new THREE.Shape();
    gableShape.moveTo(-8, 0); gableShape.lineTo(8, 0); gableShape.lineTo(0, 3.25); gableShape.closePath();
    const houseGable = new THREE.Mesh(new THREE.ShapeGeometry(gableShape), house.shell);
    houseGable.name = 'house-gable-finish';
    houseGable.position.set(house.x, 7.18, frontZ + house.facing * 0.37);
    if (house.facing === 1) houseGable.rotation.y = Math.PI;
    decorative(houseGable); root.add(houseGable);
    const windowFinish = new THREE.MeshBasicMaterial({ color: 0x24464f });
    for (const offset of [-3.75, 3.75]) {
      const windowPanel = roundedBox('upper-window-finish', [2.2, 1.55, 0.05], windowFinish, 0.03, 2);
      windowPanel.position.set(house.x + offset, 5.55, frontZ + house.facing * 0.44);
      decorative(windowPanel); root.add(windowPanel);
    }
    for (const side of [-1, 1]) {
      const door = roundedBox('recessed-entry-door', [0.82, 2.5, 0.12], dark, 0.04);
      door.position.set(house.x + side * 1.62, 1.28, frontZ + house.facing * 0.34);
      door.rotation.y = side * house.facing * 0.72;
      decorative(door); root.add(door);
    }
    const awning = roundedBox('entry-awning', [4.8, 0.18, 1.35], trim, 0.08);
    awning.position.set(house.x, 3.35, frontZ + house.facing * 0.62);
    awning.rotation.x = house.facing * -0.11;
    decorative(awning); root.add(awning);

    // Warm rear finish prevents open entries reading as a crushed-black house silhouette.
    const interiorBackdrop = roundedBox('interior-back-wall-finish', [14.2, 6.5, 0.12], interiorWall, 0.025, 2);
    interiorBackdrop.position.set(house.x, 3.25, backZ + house.facing * 0.22);
    decorative(interiorBackdrop); root.add(interiorBackdrop);

    for (const levelY of [2.9, 6.95]) {
      for (const sideX of [house.x - 8.38, house.x + 8.38]) {
        const downpipe = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, levelY - 0.2, 8), dark);
        downpipe.position.set(sideX, levelY / 2, house.z + 5.8);
        decorative(downpipe); root.add(downpipe);
      }
    }

    for (const xOffset of [-4.2, -1.4, 1.4, 4.2]) {
      const rail = roundedBox('balcony-rail', [0.12, 1.05, 0.12], trim, 0.025);
      rail.position.set(house.x + xOffset, 4.72, backZ - house.facing * 1.2);
      decorative(rail); root.add(rail);
    }
    const railTop = roundedBox('balcony-rail-top', [9.2, 0.12, 0.14], trim, 0.025);
    railTop.position.set(house.x, 5.2, backZ - house.facing * 1.2);
    decorative(railTop); root.add(railTop);

    const sofa = new THREE.Group();
    sofa.position.set(house.x - 3.8, 0, house.z + house.facing * 1.8);
    const seat = roundedBox('interior-sofa-seat', [3.2, 0.58, 1.15], house.fabric, 0.16, 4);
    seat.position.y = 0.55;
    const back = roundedBox('interior-sofa-back', [3.2, 1.05, 0.38], house.fabric, 0.14, 4);
    back.position.set(0, 1.12, -house.facing * 0.42);
    sofa.add(seat, back); decorative(sofa); root.add(sofa);

    const counter = roundedBox('interior-counter', [3.7, 1.05, 0.8], timber, 0.06);
    counter.position.set(house.x + 3.2, 0.53, house.z - house.facing * 2.8);
    decorative(counter); root.add(counter);

    for (const xOffset of [-5.6, -2.8, 2.8, 5.6]) {
      const gardenWall = roundedBox('garden-wall', [2.2, 0.64, 0.48], trim, 0.1);
      gardenWall.position.set(house.x + xOffset, 0.32, frontZ + house.facing * 3.6);
      decorative(gardenWall); root.add(gardenWall);
    }
  }

  // The end garages are major lane anchors; give them bright readable gables instead of dark blockout silhouettes.
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
  for (const rotation of [0, Math.PI / 3, -Math.PI / 3]) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(2.25, 0.13, 10, 42), ringMaterial);
    ring.position.y = 3.25; ring.rotation.set(Math.PI / 2, rotation, rotation * 0.45); landmark.add(ring);
  }
  const nucleus = new THREE.Mesh(new THREE.IcosahedronGeometry(0.62, 2), new THREE.MeshStandardMaterial({ color: 0xffc851, emissive: 0xb85b13, emissiveIntensity: 1.6, roughness: 0.32 }));
  nucleus.position.y = 3.25; landmark.add(nucleus);
  decorative(landmark); root.add(landmark);
}

function addRouteArchitecture(root: THREE.Group): void {
  const frame = new THREE.MeshStandardMaterial({ color: 0x26343a, roughness: 0.42, metalness: 0.68 });
  const trim = new THREE.MeshStandardMaterial({ color: 0xe5bd4b, roughness: 0.52, metalness: 0.32 });
  const concrete = texturedMaterial('./assets/original/textures/concrete-poured.png', { roughness: 0.9, repeatX: 2, repeatY: 4 });
  const glass = new THREE.MeshPhysicalMaterial({ color: 0x7fc6c3, transparent: true, opacity: 0.32, roughness: 0.18, metalness: 0.08, depthWrite: false });
  const solar = new THREE.MeshStandardMaterial({ color: 0x173d58, emissive: 0x071d2c, emissiveIntensity: 0.7, roughness: 0.3, metalness: 0.72 });
  const routeBox = (name: string, size: [number, number, number], material: THREE.Material, radius: number) => roundedBox(name, size, material, radius, 2);

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

  // Turn anonymous cover cubes into authored modular test barriers.
  COVER_LAYOUT.forEach(([x, z, width, depth], index) => {
    const cap = routeBox('barrier-cap', [width + 0.18, 0.16, depth + 0.18], index % 2 ? trim : frame, 0.05);
    cap.position.set(x, 1.58, z); decorative(cap); root.add(cap);
    for (const side of [-1, 1]) {
      const rib = routeBox('barrier-rib', [0.12, 1.18, depth + 0.1], frame, 0.03);
      rib.position.set(x + side * (width / 2 - 0.18), 0.78, z); decorative(rib); root.add(rib);
    }
  });
}

function addHouseInteriorLighting(root: THREE.Group): void {
  const fixtureMaterial = new THREE.MeshStandardMaterial({
    color: 0xffe5b5,
    emissive: 0xffb45b,
    emissiveIntensity: 2.4,
    roughness: 0.45,
  });
  for (const { x, z } of HOUSE_LAYOUT) {
    const light = new THREE.PointLight(0xffd7a0, 4.8, 21, 1.7);
    light.position.set(x, 4.8, z);
    root.add(light);
    const fixture = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.08, 16), fixtureMaterial);
    fixture.name = 'interior-ceiling-light';
    fixture.position.set(x, 6.9, z);
    root.add(fixture);
  }
}

/** Builds original Atomic Acres hero vehicles and environmental props. */
export async function loadArenaArt(
  scene: THREE.Scene,
  onProgress?: (loaded: number, total: number) => void,
  reducedDetail = false,
): Promise<ArenaArtResult> {
  scene.traverse((node) => {
    if (LEGACY_VEHICLE_NAMES.has(node.name) || node.name === 'primitive-tree') node.visible = false;
  });

  const root = new THREE.Group();
  root.name = 'original-arena-art';
  scene.add(root);
  addHouseInteriorLighting(root);

  const reduced = reducedDetail || new URLSearchParams(window.location.search).get('render') === 'compat';
  const coach = buildRetroCoach();
  coach.position.set(-3.8, 0, 7);
  coach.rotation.y = 0.03;
  coach.traverse((node) => { node.userData.blocksShots = true; });
  root.add(coach);
  onProgress?.(1, 12);

  const truck = buildRetroDeliveryTruck();
  truck.position.set(4.2, 0, -8.8);
  truck.rotation.y = Math.PI;
  truck.traverse((node) => { node.userData.blocksShots = true; });
  root.add(truck);
  onProgress?.(2, 12);

  addTree(root, -29, -23, 1.05); onProgress?.(3, 12);
  addTree(root, 29, 24, 1.1); onProgress?.(4, 12);
  addTree(root, -28, 29, 0.82); onProgress?.(5, 12);
  addTree(root, 27, -31, 0.9); onProgress?.(6, 12);
  addStreetProps(root); onProgress?.(7, 12);

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
  beacon.position.y = 9.2; tower.add(beacon); decorative(tower); root.add(tower); onProgress?.(8, 12);

  if (!reducedDetail) {
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
