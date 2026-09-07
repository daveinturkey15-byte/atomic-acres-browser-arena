/**
 * HF-405 - "need a better scope 1.5x on the crossbow".
 *
 * The magnification half of the report was closed by ads-sight-profile.ts:
 * the crossbow now aims at its authored 1.5x (60.19 degrees against the
 * generic 62). This file covers the half that made the owner say the scope
 * does nothing anyway — the optic did not LOOK like or BEHAVE like glass:
 *
 *   1. The authored housing is a CAPPED cylinder. Aiming down the optic put a
 *      solid gunmetal disc on the aim point and hid the authored illuminated
 *      reticle behind it. Measured on the gun range: hiding the housing mesh
 *      restored both the view and the reticle.
 *   2. The optic is authored at true size on a viewmodel about 1.2 m from the
 *      eye, so its ocular subtended ~36 px at 720p — too small to read as
 *      glass.
 *   3. Nothing anywhere drew optic furniture, so ADS was visually the same
 *      mode as the hip.
 */
import { join } from 'node:path';
import { readFileSync } from 'node:fs';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  HF405_COMPACT_OPTIC_BORE_CONTRACT,
  HF405_COMPACT_OPTIC_BORE_LENS_FRACTION,
  applyPass70WeaponMaterialSemantics,
  authoredOpticAssembly,
  carveHf405CompactOpticBore,
  nearestOpticWindowMesh,
} from './weapon-model';
import {
  COMPACT_OPTIC_FOV_CONVERGENCE_DEGREES,
  COMPACT_OPTIC_SIGHT_PICTURE_CONTRACT,
  adsSightProfile,
  compactOpticWeapon,
  deriveCompactOpticSightPicture,
  opticBeatsIronSights,
  opticMagnificationLabel,
} from './ads-sight-profile';
import { COMPACT_OPTIC_ADS_EYE_SCALE } from './weapon-presentation';
import { WEAPON_IDS } from './protocol';

const FIRST_PERSON_DELIVERY = join(
  process.cwd(),
  'public/assets/original/models/weapons/pass65-crossbow',
  'pass65-crossbow-fp-lod0.glb',
);

const read = (relative: string): string => readFileSync(new URL(relative, import.meta.url), 'utf8');

/**
 * A stand-in for the delivered optic: two clear lens discs either side of a
 * capped gunmetal tube, with an emissive reticle. Only the cap topology
 * matters, and reproducing it here is what lets the carve be tested without
 * decoding a 280 KB meshopt delivery.
 */
function buildCappedOptic(): {
  assembly: THREE.Object3D;
  housing: THREE.Mesh;
  ocular: THREE.Mesh;
  reticle: THREE.Mesh;
  rearSocket: THREE.Object3D;
  frontSocket: THREE.Object3D;
} {
  const assembly = new THREE.Group();
  assembly.name = 'test-compact-optic';
  assembly.userData.atomic_socket = 'optic';
  assembly.userData.magnification = 1.5;

  const surface = (mesh: THREE.Mesh, materialName: string) => {
    applyPass70WeaponMaterialSemantics(mesh.material as THREE.Material, mesh.name, materialName, 'first-person');
    (mesh.material as THREE.Material).name = materialName;
  };

  // Closed cylinder (openEnded false), axis along +Z, radius 0.075, spanning
  // z 0.14..0.44 - the delivered housing's topology. CylinderGeometry ships
  // indexed, which is what the carve degenerates.
  const housing = new THREE.Mesh(
    new THREE.CylinderGeometry(0.075, 0.075, 0.3, 24, 1, false),
    new THREE.MeshStandardMaterial(),
  );
  housing.name = 'Test_OpticBody';
  housing.rotation.x = Math.PI / 2;
  housing.position.set(0, 0, 0.29);
  surface(housing, 'MAT_Test_Gunmetal');

  const ocular = new THREE.Mesh(new THREE.CircleGeometry(0.056, 20), new THREE.MeshStandardMaterial());
  ocular.name = 'Test_OpticRearLens';
  ocular.position.set(0, 0, 0.135);
  surface(ocular, 'MAT_Test_OpticLens');

  const objective = new THREE.Mesh(new THREE.CircleGeometry(0.061, 20), new THREE.MeshStandardMaterial());
  objective.name = 'Test_OpticFrontLens';
  objective.position.set(0, 0, 0.445);
  surface(objective, 'MAT_Test_OpticLens');

  const reticle = new THREE.Mesh(new THREE.BoxGeometry(0.044, 0.002, 0.002), new THREE.MeshStandardMaterial());
  reticle.name = 'test-optic-reticle';
  reticle.position.set(0, 0, 0.453);
  surface(reticle, 'MAT_Test_Reticle');

  const rearSocket = new THREE.Object3D();
  rearSocket.name = 'rear-sight-socket';
  rearSocket.position.set(0, 0, 0.13);
  const frontSocket = new THREE.Object3D();
  frontSocket.name = 'front-sight-socket';
  frontSocket.position.set(0, 0, 0.45);

  assembly.add(housing, ocular, objective, reticle, rearSocket, frontSocket);
  assembly.updateMatrixWorld(true);
  return { assembly, housing, ocular, reticle, rearSocket, frontSocket };
}

/**
 * Opaque meshes blocking the shooter's view down the optic axis.
 *
 * Deliberately a small disc of rays rather than one axial ray: a cap fan's
 * apex sits exactly on the axis, and a ray through a shared vertex is
 * numerically excluded from every triangle that owns it, so the one probe that
 * looks most obviously correct is the one that reports a solid cap as clear.
 */
function boreBlockers(assembly: THREE.Object3D): string[] {
  assembly.updateMatrixWorld(true);
  const raycaster = new THREE.Raycaster(new THREE.Vector3(), new THREE.Vector3(0, 0, 1), 0, 10);
  const blockers = new Set<string>();
  for (const [x, y] of [[0, 0], [0.02, 0], [-0.02, 0], [0, 0.02], [0, -0.02]] as const) {
    raycaster.set(new THREE.Vector3(x, y, -0.4), new THREE.Vector3(0, 0, 1));
    for (const hit of raycaster.intersectObject(assembly, true)) {
      const material = hit.object instanceof THREE.Mesh
        ? (Array.isArray(hit.object.material) ? hit.object.material[0]! : hit.object.material)
        : null;
      if (material?.userData.pass70FirstPersonSurface === 'opaque-body') blockers.add(hit.object.name);
    }
  }
  return [...blockers];
}

describe('HF-405 compact optic bore', () => {
  it('proves the delivered first-person optic is a closed housing on the sight axis', async () => {
    await MeshoptDecoder.ready;
    const io = new NodeIO()
      .registerExtensions(ALL_EXTENSIONS)
      .registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
    const document = await io.read(FIRST_PERSON_DELIVERY);
    const nodes = document.getRoot().listNodes();

    const assembly = nodes.find((node) => node.getExtras().atomic_socket === 'optic'
      && Number.isFinite(node.getExtras().magnification));
    expect(assembly, 'authored optic assembly').toBeDefined();
    expect(assembly!.getExtras().magnification).toBe(1.5);
    for (const socket of ['rear-sight-socket', 'front-sight-socket', 'optic-socket']) {
      expect(nodes.some((node) => node.getName() === socket), socket).toBe(true);
    }
    const lenses = assembly!.listChildren().filter((node) => /Lens/u.test(node.getName()));
    expect(lenses, 'two authored optic lenses').toHaveLength(2);

    // The housing is a solid of revolution about the sight axis whose vertices
    // reach the axis: a capped tube. An OPEN tube has no vertex on its axis.
    const housing = assembly!.listChildren().find((node) => /OpticBody/u.test(node.getName()));
    expect(housing, 'authored optic housing').toBeDefined();
    const positions = housing!.getMesh()!.listPrimitives()[0]!.getAttribute('POSITION')!;
    // Quantised deliveries store normalised shorts; the ratio to the accessor's
    // own extent is all this assertion needs, so normalise against them.
    const [maximumX, , maximumZ] = positions.getMax([]) as number[];
    let axisVertices = 0;
    for (let vertex = 0; vertex < positions.getCount(); vertex += 1) {
      const [x, , z] = positions.getElement(vertex, []) as number[];
      // Local Y is the cylinder axis before the authored 90-degree rotation, so
      // a vertex at X=Z=0 can only belong to a cap fan.
      if (Math.abs(x! / maximumX!) < 0.02 && Math.abs(z! / maximumZ!) < 0.02) axisVertices += 1;
    }
    expect(axisVertices, 'cap fan vertices on the housing axis').toBeGreaterThan(0);
  }, 30_000);

  it('opens the bore without touching the lenses or the reticle', () => {
    const optic = buildCappedOptic();
    expect(boreBlockers(optic.assembly), 'capped housing blocks the sight axis')
      .toContain('Test_OpticBody');

    const ocular = nearestOpticWindowMesh(optic.assembly, optic.rearSocket);
    expect(ocular?.name).toBe('Test_OpticRearLens');
    expect(authoredOpticAssembly(optic.assembly)).toBe(optic.assembly);

    const reticleIndexBefore = optic.reticle.geometry.index?.array.slice();
    const bore = carveHf405CompactOpticBore(optic.assembly, ocular!, optic.rearSocket, optic.frontSocket);

    expect(bore.applied).toBe(true);
    expect(bore.contract).toBe(HF405_COMPACT_OPTIC_BORE_CONTRACT);
    expect(bore.suppressedElements).toBeGreaterThan(0);
    expect(bore.batches.map((batch) => batch.mesh)).toEqual(['Test_OpticBody']);
    expect(bore.corridorLengthMeters).toBeCloseTo((0.45 - 0.13) * 2, 6);
    // The corridor stays inside the ocular glass and well inside the tube.
    expect(bore.boreRadiusMeters).toBeCloseTo(0.056 * HF405_COMPACT_OPTIC_BORE_LENS_FRACTION, 6);
    expect(bore.boreRadiusMeters).toBeLessThan(0.075);
    // The housing survives as a housing: exactly the two cap fans go, and the
    // tube wall a ray crossing the optic sideways still meets is untouched.
    expect(bore.suppressedElements).toBeLessThan(bore.submittedElements);
    const sideways = new THREE.Raycaster(new THREE.Vector3(0.01, -0.4, 0.29), new THREE.Vector3(0, 1, 0), 0, 10);
    expect(sideways.intersectObject(optic.assembly, true).map((intersection) => intersection.object.name))
      .toContain('Test_OpticBody');

    expect(boreBlockers(optic.assembly), 'bore is clear after the carve').toEqual([]);
    expect(optic.reticle.geometry.index?.array).toEqual(reticleIndexBefore);
    expect(optic.assembly.userData.hf405CompactOpticBore).toBe(bore);
  });

  it('is wired into the shipped crossbow first-person instantiation, failing closed', () => {
    const model = read('./weapon-model.ts');
    expect(model).toContain("if (id === 'explosive-crossbow' && variant === 'first-person') {");
    expect(model).toContain('const bore = carveHf405CompactOpticBore(assembly, ocular, rearSocket, frontSocket);');
    expect(model).toContain("if (!bore.applied) throw new Error('Explosive crossbow compact optic bore did not intersect its cloned housing');");
    // The carve must run on geometry this instance owns, or it would punch a
    // hole in the world and drop variants too.
    expect(model.indexOf('cloneMeshGeometriesForOwner(visual,'))
      .toBeLessThan(model.indexOf('carveHf405CompactOpticBore(assembly,'));
  });
});

describe('HF-405 compact optic sight picture', () => {
  const BASE_FOV = 82;

  it('marks the crossbow as a compact optic and leaves the full-screen optics alone', () => {
    expect(adsSightProfile('explosive-crossbow').marker).toBe('compact-optic');
    expect(WEAPON_IDS.filter((weapon) => adsSightProfile(weapon).marker === 'compact-optic'))
      .toEqual(['explosive-crossbow']);
  });

  it('grants the treatment only where the authored optic actually beats iron sights', () => {
    expect(compactOpticWeapon('explosive-crossbow', BASE_FOV)).toBe(true);
    expect(opticBeatsIronSights('explosive-crossbow', BASE_FOV)).toBe(true);
    // Both author an optic; both are correctly clamped back to the iron-sight
    // number, so neither may be dressed as magnified glass.
    for (const weapon of ['carbine', 'flare-gun'] as const) {
      expect(opticBeatsIronSights(weapon, BASE_FOV)).toBe(false);
      expect(compactOpticWeapon(weapon, BASE_FOV)).toBe(false);
    }
    expect(compactOpticWeapon('sniper', BASE_FOV)).toBe(false);
    // Every marked weapon must be backed by a real optic, in both directions.
    for (const weapon of WEAPON_IDS) {
      expect(compactOpticWeapon(weapon, BASE_FOV))
        .toBe(adsSightProfile(weapon).marker === 'compact-optic' && opticBeatsIronSights(weapon, BASE_FOV));
    }
  });

  const settled = {
    alive: true,
    weapon: 'explosive-crossbow',
    adsHeld: true,
    adsProgress: 1,
    baseFovDegrees: BASE_FOV,
    // The settled ADS field of view for the crossbow's 2.5x optic.
    cameraFovDegrees: 38.35,
  } as const;

  it('presents settled glass only once the camera has actually magnified', () => {
    const picture = deriveCompactOpticSightPicture(settled);
    expect(picture.active).toBe(true);
    expect(picture.contract).toBe(COMPACT_OPTIC_SIGHT_PICTURE_CONTRACT);
    expect(picture.glassBlend).toBeGreaterThan(0.99);
    expect(picture.magnification).toBe(2.5);
    expect(picture.label).toBe('2.5x');
    expect(opticMagnificationLabel(1.5)).toBe('1.5x');
  });

  it('never draws glass over an un-magnified or un-aimed frame', () => {
    // Hip: no aim, no glass.
    expect(deriveCompactOpticSightPicture({ ...settled, adsHeld: false }).active).toBe(false);
    expect(deriveCompactOpticSightPicture({ ...settled, alive: false }).active).toBe(false);
    expect(deriveCompactOpticSightPicture({ ...settled, adsProgress: 0.4 }).active).toBe(false);
    // The first frame of the aim: the pose has started, the field of view has
    // not caught up. Blend in, do not pop in.
    const rising = deriveCompactOpticSightPicture({ ...settled, adsProgress: 0.7, cameraFovDegrees: 72 });
    expect(rising.active).toBe(false);
    const midway = deriveCompactOpticSightPicture({ ...settled, adsProgress: 0.8, cameraFovDegrees: 40.5 });
    expect(midway.glassBlend).toBeGreaterThan(0);
    expect(midway.glassBlend).toBeLessThan(1);
    // A weapon with no compact optic never presents one, however it is aimed.
    expect(deriveCompactOpticSightPicture({ ...settled, weapon: 'sniper' }).active).toBe(false);
    expect(deriveCompactOpticSightPicture({ ...settled, weapon: 'smg' }).active).toBe(false);
    expect(COMPACT_OPTIC_FOV_CONVERGENCE_DEGREES).toBeGreaterThan(0);
  });

  it('grows the authored optic to eye scale only while aiming, and only on its own pivot', () => {
    const presentation = read('./weapon-presentation.ts');
    expect(COMPACT_OPTIC_ADS_EYE_SCALE).toBeGreaterThan(1);
    expect(presentation).toContain('const scale = 1 + (COMPACT_OPTIC_ADS_EYE_SCALE - 1) * this.adsBlend;');
    expect(presentation).toContain('assembly.scale.setScalar(scale);');
    expect(presentation).toContain('base.x + pivot.x * (1 - scale),');
    expect(presentation).toContain('this.applyCompactOpticAdsPresentation(activeModel);');
    // A compact optic aims through its optic socket, not the irons it also carries.
    expect(presentation).toContain("this.active === 'carbine' || adsSightProfile(this.active).marker === 'compact-optic'");
  });

  it('is what legacy-main and the overlay actually consume', () => {
    const main = read('./legacy-main.ts');
    const overlay = read('./ui/compact-optic-sight.ts');
    const css = read('./ui/compact-optic-sight.css');
    expect(main).toContain('applyCompactOpticSightPicture(hudRoot, deriveCompactOpticSightPicture({');
    expect(main).toContain("import { applyCompactOpticSightPicture } from './ui/compact-optic-sight';");
    // It must NOT join the fullscreen-suppression set: the crossbow keeps its
    // viewmodel and its periphery.
    expect(main).not.toContain('compactOpticActive || localKillstreakActorSnapshot');
    expect(main).toContain('sniperScopeActive || dmrThermalActive || railgunScopeActive');
    expect(overlay).toContain("overlay.id = COMPACT_OPTIC_OVERLAY_ID;");
    // The housing frames; it never tunnels. Fully clear across the middle.
    expect(css).toContain('rgba(4, 8, 10, 0) 0 42%');
    expect(css).not.toContain('#010304 100%');
  });
});
