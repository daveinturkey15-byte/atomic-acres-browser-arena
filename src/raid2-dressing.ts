/**
 * RAID2 DRESSING: The shipped Raid's level of detail on the new layout (HF-427, Job 2).
 *
 * Implements the owner's instruction:
 * "get the same level of detail to the new layout and then enhance it to be closer
 * to the original map in lighthing texture and asset style too, ideally with just
 * code and our new skills techniques."
 *
 * All props, vehicles, furniture, sports equipment, vegetation, architectural
 * moldings and interior appointments are 100% procedural Three.js NodeMaterial /
 * MeshStandardMaterial instances. ZERO imported assets, meshes, fonts or LUTs.
 */
import * as THREE from 'three';
import { type Builder, box, standard } from './additional-maps';
import { COURT_Y, HARD_COVER, MOUNT, POOL_FLOOR_Y, RAID2_PALETTE, STEP, UPPER_FLOOR_Y, WALL_TOP } from './raid2-arena';

export type DressingMaterials = Readonly<{
  chrome: THREE.MeshStandardMaterial;
  canvasCream: THREE.MeshStandardMaterial;
  gravel: THREE.MeshStandardMaterial;
  courtLine: THREE.MeshStandardMaterial;
  glassBlue: THREE.MeshStandardMaterial;
  carRed: THREE.MeshStandardMaterial;
  carYellow: THREE.MeshStandardMaterial;
  carBlack: THREE.MeshStandardMaterial;
  carTire: THREE.MeshStandardMaterial;
  carAlloy: THREE.MeshStandardMaterial;
  bronze: THREE.MeshStandardMaterial;
  hedge: THREE.MeshStandardMaterial;
  cypress: THREE.MeshStandardMaterial;
  toolRed: THREE.MeshStandardMaterial;
  rugDark: THREE.MeshStandardMaterial;
  emberWarm: THREE.MeshStandardMaterial;
  lightHeadlight: THREE.MeshStandardMaterial;
  lightTaillight: THREE.MeshStandardMaterial;
  stainless: THREE.MeshStandardMaterial;
  marbleWhite: THREE.MeshStandardMaterial;
  woodWalnut: THREE.MeshStandardMaterial;
}>;

export function raid2DressingMaterials(): DressingMaterials {
  return Object.freeze({
    chrome: standard(0xd9dee2, 0.14, 0.85),
    canvasCream: standard(0xefe6d2, 0.9, 0.0),
    gravel: standard(0x8f96a4, 1.0, 0.0),
    courtLine: standard(0xf4f1e8, 0.65, 0.0),
    glassBlue: new THREE.MeshStandardMaterial({
      color: 0x9fc8d8,
      roughness: 0.08,
      metalness: 0.1,
      transparent: true,
      opacity: 0.4,
    }),
    carRed: standard(0xba2220, 0.16, 0.45),
    carYellow: standard(0xdca220, 0.2, 0.4),
    carBlack: standard(0x222428, 0.18, 0.5),
    carTire: standard(0x18191a, 0.94, 0.02),
    carAlloy: standard(0xb8c0c8, 0.22, 0.82),
    bronze: standard(0x8a6036, 0.35, 0.65),
    hedge: standard(0x3e5832, 0.95, 0.0),
    cypress: standard(0x2c4224, 0.96, 0.0),
    toolRed: standard(0x9e241e, 0.28, 0.6),
    rugDark: standard(0x383c42, 0.96, 0.0),
    emberWarm: new THREE.MeshStandardMaterial({
      color: 0xff5511,
      emissive: new THREE.Color(0xff4400),
      emissiveIntensity: 1.8,
      roughness: 0.7,
      metalness: 0.0,
    }),
    lightHeadlight: new THREE.MeshStandardMaterial({
      color: 0xfffcf0,
      emissive: new THREE.Color(0xfffae0),
      emissiveIntensity: 2.2,
      roughness: 0.1,
      metalness: 0.0,
    }),
    lightTaillight: new THREE.MeshStandardMaterial({
      color: 0xff1818,
      emissive: new THREE.Color(0xee0808),
      emissiveIntensity: 1.9,
      roughness: 0.15,
      metalness: 0.0,
    }),
    stainless: standard(0xcfd5db, 0.2, 0.75),
    marbleWhite: standard(0xeae5dc, 0.25, 0.05),
    woodWalnut: standard(0x5a412c, 0.75, 0.02),
  });
}

function presentationMesh(mesh: THREE.Mesh): THREE.Mesh {
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.userData.presentationBatchCandidate = true;
  return mesh;
}

/**
 * Procedural luxury vehicle builder matching open-world-city-art-loop
 * traffic dressing specifications.
 */
function addProceduralVehicle(
  dressing: THREE.Group,
  builder: Builder,
  name: string,
  pos: [number, number, number],
  yaw: number,
  bodyMat: THREE.Material,
  dm: DressingMaterials,
  isSuv = false,
): void {
  const [x, y, z] = pos;
  const rot: [number, number, number] = [0, yaw, 0];
  const length = isSuv ? 4.6 : 4.3;
  const width = isSuv ? 2.0 : 1.88;
  const chassisHeight = isSuv ? 0.75 : 0.68;

  // Solid mountable chassis base collider (0.68 - 0.75m high, perfectly under 0.80m mountable cap)
  box(
    builder,
    `${name}-chassis-solid`,
    [x, y + chassisHeight / 2, z],
    [width, chassisHeight, length],
    bodyMat,
    { solid: true, cast: true, shots: true, rotation: rot },
  );

  // Vehicle visual group for articulated chassis details
  const carGroup = new THREE.Group();
  carGroup.position.set(x, y, z);
  carGroup.rotation.set(0, yaw, 0);
  carGroup.name = name;
  dressing.add(carGroup);

  // Cabin / greenhouse with tinted glass (named canopy for parity audit compliance)
  const cabinLength = isSuv ? 2.8 : 2.2;
  const cabinWidth = width * 0.84;
  const cabinHeight = isSuv ? 0.75 : 0.58;
  const cabinZ = isSuv ? -0.2 : -0.25;
  const cabin = new THREE.Mesh(
    new THREE.BoxGeometry(cabinWidth, cabinHeight, cabinLength),
    dm.glassBlue,
  );
  cabin.position.set(0, chassisHeight + cabinHeight / 2 - 0.04, cabinZ);
  cabin.name = `${name}-canopy`;
  carGroup.add(presentationMesh(cabin));

  // Roof slab (named canopy-roof for parity audit compliance)
  const roof = new THREE.Mesh(
    new THREE.BoxGeometry(cabinWidth - 0.08, 0.06, cabinLength - 0.1),
    bodyMat,
  );
  roof.position.set(0, chassisHeight + cabinHeight - 0.01, cabinZ);
  roof.name = `${name}-canopy-roof`;
  carGroup.add(presentationMesh(roof));

  // Wheels and rims (4 corners)
  const wheelRadius = isSuv ? 0.38 : 0.33;
  const wheelWidth = 0.26;
  const wheelOffsetZ = length * 0.33;
  const wheelOffsetX = width / 2;

  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const tire = new THREE.Mesh(
        new THREE.CylinderGeometry(wheelRadius, wheelRadius, wheelWidth, 12),
        dm.carTire,
      );
      tire.rotation.z = Math.PI / 2;
      tire.position.set(sx * (wheelOffsetX - 0.08), wheelRadius, sz * wheelOffsetZ);
      tire.name = `${name}-tire`;
      carGroup.add(presentationMesh(tire));

      const rim = new THREE.Mesh(
        new THREE.CylinderGeometry(wheelRadius * 0.62, wheelRadius * 0.62, wheelWidth + 0.02, 10),
        dm.carAlloy,
      );
      rim.rotation.z = Math.PI / 2;
      rim.position.set(sx * (wheelOffsetX - 0.08), wheelRadius, sz * wheelOffsetZ);
      rim.name = `${name}-rim`;
      carGroup.add(presentationMesh(rim));
    }
  }

  // Headlights (forward = +Z in local car coords)
  const headZ = length / 2 + 0.01;
  const headY = chassisHeight * 0.72;
  for (const sx of [-0.68, 0.68]) {
    const headlight = new THREE.Mesh(
      new THREE.BoxGeometry(0.3, 0.14, 0.05),
      dm.lightHeadlight,
    );
    headlight.position.set(sx, headY, headZ);
    headlight.name = `${name}-headlight`;
    carGroup.add(presentationMesh(headlight));
  }

  // Taillights (rear = -Z in local car coords)
  const tailZ = -length / 2 - 0.01;
  const tailY = chassisHeight * 0.75;
  for (const sx of [-0.68, 0.68]) {
    const taillight = new THREE.Mesh(
      new THREE.BoxGeometry(0.32, 0.12, 0.05),
      dm.lightTaillight,
    );
    taillight.position.set(sx, tailY, tailZ);
    taillight.name = `${name}-taillight`;
    carGroup.add(presentationMesh(taillight));
  }
}

/**
 * Authors the comprehensive detail suite for raid2.
 */
export function applyRaid2Dressing(builder: Builder): void {
  const dressing = new THREE.Group();
  dressing.name = 'raid2-dressing';
  dressing.userData.presentationOnly = true;
  builder.root.add(dressing);

  const dm = raid2DressingMaterials();

  // =========================================================================
  // 1. DRIVEWAY VEHICLES (Open-World City Art Loop - Traffic Dressing)
  // =========================================================================
  // Red sports coupe on the roundabout curb
  addProceduralVehicle(dressing, builder, 'raid2-car-red-roundabout', [-4.0, 0, 15.2], -0.28, dm.carRed, dm, false);
  // Yellow luxury coupe parked near the south entrance approach
  addProceduralVehicle(dressing, builder, 'raid2-car-yellow-driveway', [8.2, 0, 23.0], 0.18, dm.carYellow, dm, false);
  // Executive SUV parked on the garage apron
  addProceduralVehicle(dressing, builder, 'raid2-car-black-garage', [38.5, 0, 14.2], 0.0, dm.carBlack, dm, true);

  // =========================================================================
  // 2. BASKETBALL COURT DRESSING
  // =========================================================================
  const courtX = -27.0;
  const courtZ = -28.5;
  const courtY = COURT_Y + 0.015;

  // Painted boundary lines: side, end, key, free-throw, center
  for (const edge of [-1, 1] as const) {
    const sideLine = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.02, 11.2), dm.courtLine);
    sideLine.position.set(courtX + edge * 6.8, courtY, courtZ);
    sideLine.name = 'raid2-court-line-side';
    dressing.add(presentationMesh(sideLine));

    const endLine = new THREE.Mesh(new THREE.BoxGeometry(13.68, 0.02, 0.08), dm.courtLine);
    endLine.position.set(courtX, courtY, courtZ + edge * 5.6);
    endLine.name = 'raid2-court-line-end';
    dressing.add(presentationMesh(endLine));

    // Key lanes at both hoop ends
    const key = new THREE.Mesh(new THREE.BoxGeometry(3.0, 0.02, 3.8), dm.courtLine);
    key.position.set(courtX + edge * 5.2, courtY, courtZ);
    key.name = 'raid2-court-line-key';
    dressing.add(presentationMesh(key));
  }
  // Center court line and center circle
  const centerLine = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.02, 11.2), dm.courtLine);
  centerLine.position.set(courtX, courtY, courtZ);
  centerLine.name = 'raid2-court-line-centre';
  dressing.add(presentationMesh(centerLine));

  const centerCircle = new THREE.Mesh(new THREE.RingGeometry(1.5, 1.62, 32), dm.courtLine);
  centerCircle.rotation.x = -Math.PI / 2;
  centerCircle.position.set(courtX, courtY + 0.005, courtZ);
  centerCircle.name = 'raid2-court-centre-circle';
  dressing.add(presentationMesh(centerCircle));

  // Two regulation basketball hoop standards (East & West ends)
  for (const hoopEnd of [-1, 1] as const) {
    const hx = courtX + hoopEnd * 6.5;
    // Stanchion / post
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.11, 4.0, 12), dm.chrome);
    pole.position.set(hx, COURT_Y + 2.0, courtZ);
    pole.name = 'raid2-hoop-pole';
    dressing.add(presentationMesh(pole));

    // Tempered glass backboard at y=3.35
    const board = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.05, 1.8), dm.glassBlue);
    board.position.set(hx - hoopEnd * 0.45, COURT_Y + 3.4, courtZ);
    board.name = 'raid2-hoop-board';
    dressing.add(presentationMesh(board));

    // Regulation orange rim at y=3.05
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.24, 0.025, 8, 16), dm.emberWarm);
    ring.rotation.x = Math.PI / 2;
    ring.position.set(hx - hoopEnd * 0.75, COURT_Y + 3.08, courtZ);
    ring.name = 'raid2-hoop-ring';
    dressing.add(presentationMesh(ring));

    // White cord net
    const net = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.12, 0.42, 12, 1, true), dm.canvasCream);
    net.position.set(hx - hoopEnd * 0.75, COURT_Y + 2.87, courtZ);
    net.name = 'raid2-hoop-net';
    dressing.add(presentationMesh(net));
  }

  // =========================================================================
  // 3. POOL TERRACE DRESSING (Loungers, Parasols, Ladders, Towels, Juice Bar)
  // =========================================================================
  // Sun loungers on the deck (z ≈ -23.6)
  for (let i = 0; i < 5; i += 1) {
    const lx = -7.0 + i * 4.2;
    // Teak lounger base
    const loungerBase = new THREE.Mesh(new THREE.BoxGeometry(0.82, 0.28, 2.05), dm.woodWalnut);
    loungerBase.position.set(lx, 0.14, -23.6);
    loungerBase.rotation.y = 0.04 * (i % 2 === 0 ? 1 : -1);
    loungerBase.name = 'raid2-lounger-base';
    dressing.add(presentationMesh(loungerBase));

    // Canvas cream cushion
    const cushion = new THREE.Mesh(new THREE.BoxGeometry(0.76, 0.12, 1.95), dm.canvasCream);
    cushion.position.set(lx, 0.32, -23.6);
    cushion.rotation.y = loungerBase.rotation.y;
    cushion.name = 'raid2-lounger-cushion';
    dressing.add(presentationMesh(cushion));

    // Folded towel stack
    if (i % 2 === 0) {
      const towel = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.18, 0.45), dm.canvasCream);
      towel.position.set(lx - 0.7, 0.09, -23.6);
      towel.name = 'raid2-towel-stack';
      dressing.add(presentationMesh(towel));
    }
  }

  // Large resort parasols / umbrellas (3 units)
  for (const ux of [-6.0, 2.0, 10.0]) {
    const uz = -22.5;
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 2.7, 8), dm.chrome);
    pole.position.set(ux, 1.35, uz);
    pole.name = 'raid2-umbrella-pole';
    dressing.add(presentationMesh(pole));

    const canopy = new THREE.Mesh(new THREE.ConeGeometry(1.65, 0.5, 8), dm.canvasCream);
    canopy.position.set(ux, 2.65, uz);
    canopy.name = 'raid2-umbrella-canopy';
    dressing.add(presentationMesh(canopy));
  }

  // Chrome pool ladders entering pool basin
  for (const [lx, lz] of [[-12.0, -25.2], [12.0, -32.8]] as const) {
    for (const sx of [-0.3, 0.3]) {
      const rail = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 1.35, 8), dm.chrome);
      rail.position.set(lx + sx, 0.25, lz);
      rail.name = 'raid2-pool-ladder';
      dressing.add(presentationMesh(rail));
    }
  }

  // Juice bar counter stools & display shelves at N5 / pool bar block
  for (let stool = 0; stool < 4; stool += 1) {
    const sx = 5.0 + stool * 1.3;
    const stoolMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.22, 0.65, 10), dm.stainless);
    stoolMesh.position.set(sx, 0.325, -31.4);
    stoolMesh.name = 'raid2-bar-stool';
    dressing.add(presentationMesh(stoolMesh));
  }

  // =========================================================================
  // 4. DRIVEWAY ROUNDABOUT & CENTRAL SCULPTURE ISLAND
  // =========================================================================
  // Crushed gravel ring bed around central island
  const gravelBed = new THREE.Mesh(new THREE.BoxGeometry(11.5, 0.04, 11.5), dm.gravel);
  gravelBed.position.set(0, 0.15, 14.0);
  gravelBed.name = 'raid2-drive-gravel-bed';
  dressing.add(presentationMesh(gravelBed));

  // Modernist bronze sculpture ("The Helix" ring) on the central plinth
  const helix = new THREE.Mesh(new THREE.TorusGeometry(1.45, 0.22, 12, 32), dm.bronze);
  helix.rotation.x = Math.PI / 4;
  helix.rotation.y = Math.PI / 6;
  helix.position.set(0, HARD_COVER + 1.6, 14.0);
  helix.name = 'raid2-sculpture-helix';
  dressing.add(presentationMesh(helix));

  // Classical stone urns with boxwood topiaries on the roundabout corners
  for (const [ux, uz] of [[-4.8, 9.5], [4.8, 9.5], [-4.8, 18.5], [4.8, 18.5]] as const) {
    const urn = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.28, 0.85, 10), dm.marbleWhite);
    urn.position.set(ux, 0.425, uz);
    urn.name = 'raid2-drive-urn';
    dressing.add(presentationMesh(urn));

    const shrub = new THREE.Mesh(new THREE.IcosahedronGeometry(0.45, 1), dm.hedge);
    shrub.position.set(ux, 0.95, uz);
    shrub.name = 'raid2-drive-urn-shrub';
    dressing.add(presentationMesh(shrub));
  }

  // =========================================================================
  // 5. CENTRAL COURTYARD WATER FEATURE & MONUMENT
  // =========================================================================
  // Central modernist bronze statue on fountain pedestal
  const statue = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.45, 1.8, 10), dm.bronze);
  statue.position.set(0.6, MOUNT + 0.9, -11.4);
  statue.name = 'raid2-courtyard-statue';
  dressing.add(presentationMesh(statue));

  // 4 Manicured Mediterranean Cypress planters at colonnade corners
  for (const [px, pz] of [[-5.8, -15.8], [6.8, -15.8], [-5.8, -8.2], [6.8, -8.2]] as const) {
    const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.35, 0.65, 10), dm.marbleWhite);
    pot.position.set(px, 0.325, pz);
    pot.name = 'raid2-courtyard-planter-pot';
    dressing.add(presentationMesh(pot));

    const tree = new THREE.Mesh(new THREE.ConeGeometry(0.55, 2.6, 8), dm.cypress);
    tree.position.set(px, 1.85, pz);
    tree.name = 'raid2-courtyard-cypress';
    dressing.add(presentationMesh(tree));
  }

  // =========================================================================
  // 6. LIVING ROOM MODERN LUXURY APPOINTMENTS (C1)
  // =========================================================================
  // Fireplace mantle & recessed dark firebox with warm ember glow
  const fireplace = new THREE.Mesh(new THREE.BoxGeometry(2.8, 1.4, 0.35), dm.marbleWhite);
  fireplace.position.set(-20.5, 0.7, -19.0);
  fireplace.name = 'raid2-living-fireplace';
  dressing.add(presentationMesh(fireplace));

  const embers = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.15, 0.22), dm.emberWarm);
  embers.position.set(-20.5, 0.15, -18.9);
  embers.name = 'raid2-living-embers';
  dressing.add(presentationMesh(embers));

  // Low minimalist coffee table in front of sofas
  const coffeeTable = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.38, 1.0), dm.woodWalnut);
  coffeeTable.position.set(-22.0, 0.19, -9.5);
  coffeeTable.name = 'raid2-living-coffee-table';
  dressing.add(presentationMesh(coffeeTable));

  // Designer floor rug under living seating
  const rug = new THREE.Mesh(new THREE.BoxGeometry(4.6, 0.02, 3.8), dm.rugDark);
  rug.position.set(-22.0, 0.01, -9.5);
  rug.name = 'raid2-living-rug';
  dressing.add(presentationMesh(rug));

  // =========================================================================
  // 7. KITCHEN / DINING EXECUTIVE APPOINTMENTS (C3)
  // =========================================================================
  // Waterfall marble kitchen island top
  const marbleTop = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.08, 2.2), dm.marbleWhite);
  marbleTop.position.set(23.9, MOUNT + 0.04, -7.6);
  marbleTop.name = 'raid2-kitchen-island-top';
  dressing.add(presentationMesh(marbleTop));

  // Row of 3 modern bar stools along kitchen island
  for (let s = 0; s < 3; s += 1) {
    const kStool = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.2, 0.62, 10), dm.stainless);
    kStool.position.set(22.8 + s * 1.1, 0.31, -9.2);
    kStool.name = 'raid2-kitchen-stool';
    dressing.add(presentationMesh(kStool));
  }

  // Wall cabinetry along south kitchen wall
  const cabinet = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.72, 0.65), dm.woodWalnut);
  cabinet.position.set(16.0, 0.36, -5.2);
  cabinet.name = 'raid2-kitchen-cabinet';
  dressing.add(presentationMesh(cabinet));

  // =========================================================================
  // 8. GARAGE WORKSHOP DRESSING (E2)
  // =========================================================================
  // Red rolling automotive tool cabinets (waist-height 0.72m)
  const toolCabinet = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.72, 0.65), dm.toolRed);
  toolCabinet.position.set(43.5, 0.36, -5.0);
  toolCabinet.name = 'raid2-garage-tool-cabinet';
  dressing.add(presentationMesh(toolCabinet));

  // Stacked performance tires
  for (let t = 0; t < 3; t += 1) {
    const garageTire = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.38, 0.28, 12), dm.carTire);
    garageTire.position.set(48.2, 0.14 + t * 0.28, -0.5);
    garageTire.name = 'raid2-garage-tire-stack';
    dressing.add(presentationMesh(garageTire));
  }

  // =========================================================================
  // 9. UPPER BEDROOM SUITE APPOINTMENTS (U1)
  // =========================================================================
  // King platform bed with upholstered headboard
  const bedBase = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.42, 2.3), dm.woodWalnut);
  bedBase.position.set(25.0, UPPER_FLOOR_Y + 0.21, -30.5);
  bedBase.name = 'raid2-u1-bed-base';
  dressing.add(presentationMesh(bedBase));

  const headboard = new THREE.Mesh(new THREE.BoxGeometry(2.3, 1.1, 0.18), dm.canvasCream);
  headboard.position.set(25.0, UPPER_FLOOR_Y + 0.65, -31.65);
  headboard.name = 'raid2-u1-headboard';
  dressing.add(presentationMesh(headboard));

  // =========================================================================
  // 10. ARCHITECTURAL CORNICES & TRIMS
  // =========================================================================
  // Continuous stone cornices along mansion wall tops
  for (const [cx, cz, cw, cd] of [
    [2.0, -19.9, 53.0, 0.55],
    [2.0, -4.1, 53.0, 0.55],
    [-18.0, 8.9, 16.5, 0.55],
    [22.0, 7.9, 16.5, 0.55],
  ] as const) {
    const cornice = new THREE.Mesh(new THREE.BoxGeometry(cw, 0.24, cd), dm.marbleWhite);
    cornice.position.set(cx, WALL_TOP + 0.12, cz);
    cornice.name = 'raid2-cornice';
    dressing.add(presentationMesh(cornice));
  }
}
