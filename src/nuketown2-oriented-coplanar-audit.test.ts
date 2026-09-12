/**
 * HF-536 night-defects-2 — the z-fighting gate that is NOT blind.
 *
 * The axis-aligned scan reported "FINDINGS: 0" while listing 103 meshes it had
 * never looked at, and the two classes the owner named (rotated kerb segments,
 * pitched roof courses) were both in that list. These tests pin the oriented
 * scan that covers them, INCLUDING a red-proof: a deliberately coplanar pair
 * of ROTATED boxes must be caught, or the gate is decorative again.
 */
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { buildNuketown2 } from './nuketown2-arena';
import {
  ORIENTED_COPLANAR_NEAR_METERS,
  ORIENTED_MIN_RACE_AREA_M2,
  auditNuketown2Oriented,
  collectSurfels,
} from './nuketown2-oriented-coplanar-audit';

/** Two 2 x 0.2 x 2 m slabs, yawed and pitched, whose top faces share a plane. */
function rotatedPair(separationMeters: number, sameMaterial: boolean): THREE.Object3D {
  const root = new THREE.Object3D();
  const geometry = new THREE.BoxGeometry(2, 0.2, 2);
  const first = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ name: 'red-proof-a' }));
  first.name = 'red-proof slab a';
  first.rotation.set(0.42, 0.83, 0);
  first.position.set(0, 3, 0);
  const second = new THREE.Mesh(
    geometry,
    sameMaterial ? first.material : new THREE.MeshStandardMaterial({ name: 'red-proof-b' }),
  );
  second.name = 'red-proof slab b';
  second.rotation.copy(first.rotation);
  // Offset along the first slab's own up axis, so the two top faces stay
  // parallel and the separation is measured along the shared normal.
  const up = new THREE.Vector3(0, 1, 0).applyEuler(first.rotation);
  second.position.copy(first.position).addScaledVector(up, separationMeters);
  root.add(first, second);
  return root;
}

describe('nuketown2 oriented coplanar audit', () => {
  it('RED PROOF: catches a deliberately coplanar pair of ROTATED boxes', () => {
    const audit = auditNuketown2Oriented(rotatedPair(0, false));
    const findings = audit.rows.filter((row) => row.classification === 'oriented-finding');
    expect(findings.length, 'a coplanar rotated pair must be a finding').toBeGreaterThan(0);
    const top = findings[0]!;
    expect(top.gap).toBeLessThan(1e-6);
    expect(top.overlap, 'the shared area is the slab face').toBeGreaterThan(3.9);
    // The faces are pitched, so this pair is invisible to any y-only scan:
    // both bodies' y-max planes differ, and their normals are not (0,1,0).
    expect(Math.abs(top.first.ny)).toBeLessThan(0.95);
  });

  it('RED PROOF: the same rotated pair separated past the band is not a finding', () => {
    // Clear of each other by the slab thickness plus the band, so no face of
    // either body sits inside the other.
    const audit = auditNuketown2Oriented(rotatedPair(0.2 + ORIENTED_COPLANAR_NEAR_METERS + 0.01, false));
    expect(audit.rows.filter((row) => row.classification === 'oriented-finding')).toHaveLength(0);
  });

  it('a coplanar rotated pair sharing one material is not a FINDING', () => {
    const audit = auditNuketown2Oriented(rotatedPair(0, true));
    expect(audit.rows.filter((row) => row.classification === 'oriented-finding')).toHaveLength(0);
    expect(audit.counts['oriented-same-material']).toBeGreaterThan(0);
  });

  it('expands InstancedMesh matrices instead of reading the prototype at the origin', () => {
    const root = new THREE.Object3D();
    const instanced = new THREE.InstancedMesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshStandardMaterial({ name: 'instanced-proof' }),
      3,
    );
    instanced.name = 'instanced proof';
    const matrix = new THREE.Matrix4();
    for (let i = 0; i < 3; i += 1) {
      matrix.makeTranslation(i * 10, 0, 0);
      instanced.setMatrixAt(i, matrix);
    }
    root.add(instanced);
    const { surfels, instancesExpanded } = collectSurfels(root);
    expect(instancesExpanded).toBe(3);
    expect(surfels).toHaveLength(18);
    // The three instances stand 10 m apart; a prototype-at-origin reader would
    // put all eighteen faces in the same place.
    const centres = new Set(surfels.map((surfel) => Math.round(surfel.cx)));
    expect([...centres].sort((a, b) => a - b)).toEqual([0, 1, 10, 11, 20, 21]);
  });

  it('declares non-box meshes as AABB bounds and never raises a finding on one', () => {
    const root = new THREE.Object3D();
    const sphere = new THREE.Mesh(
      new THREE.IcosahedronGeometry(1, 1),
      new THREE.MeshStandardMaterial({ name: 'approx-proof-a' }),
    );
    sphere.name = 'approx proof sphere';
    const slab = new THREE.Mesh(
      new THREE.BoxGeometry(4, 0.2, 4),
      new THREE.MeshStandardMaterial({ name: 'approx-proof-b' }),
    );
    slab.name = 'approx proof slab';
    // The slab's top face lands exactly on the sphere's AABB top.
    slab.position.set(0, 1 - 0.1, 0);
    root.add(sphere, slab);
    const audit = auditNuketown2Oriented(root);
    expect(audit.approxSurfels).toBe(6);
    expect(audit.rows.filter((row) => row.classification === 'oriented-finding')).toHaveLength(0);
    expect(audit.counts['approx-candidate']).toBeGreaterThan(0);
  });

  it('covers every mesh the axis-aligned scan skips', () => {
    const scene = new THREE.Scene();
    const map = buildNuketown2(scene);
    const { surfels, meshes, instancesExpanded } = collectSurfels(map.root);
    // The rotated bodies the owner named, by name, each with real faces.
    for (const name of [
      'nuketown2 carriageway head kerb segment 0',
      'nuketown2 north house A roof deck front rake',
      'nuketown2 north house A solar panel 0-0',
      'nuketown2 north exterior stair stringer 0',
    ]) {
      expect(surfels.filter((surfel) => surfel.name === name), name).toHaveLength(6);
    }
    // Instanced art is expanded, not skipped.
    expect(instancesExpanded).toBeGreaterThan(5_000);
    expect(surfels.filter((surfel) => surfel.name.startsWith('forest-conifers#')).length).toBeGreaterThan(0);
    expect(meshes).toBeGreaterThan(1_000);
  });

  it('leaves no near-coplanar race of consequential area anywhere on nuketown2', () => {
    const audit = auditNuketown2Oriented();
    const consequential = audit.rows.filter((row) => (
      (row.classification === 'oriented-finding' || row.classification === 'oriented-back-to-back-finding')
      && row.gap <= 0.005
      && row.overlap >= 0.1
      // score 0 means the shared plane is outside the play box or is a pair of
      // DOWN-facing bases sitting on the ground slab (vehicle underbodies,
      // glasshouse posts): geometrically coplanar, under the world, and seen
      // by nobody. Those rows still print in the instrument's report.
      && row.score > 0
    ));
    expect(
      consequential.map((row) => `${row.first.name} | ${row.second.name} | ${row.overlap.toFixed(2)} m2`),
      'an exactly coplanar pair of different materials over 0.1 m2 flickers at every range',
    ).toEqual([]);
    // Ratchet on the long tail (sub-0.1 m2 slivers and 0.03 m band edges), so
    // a future pass cannot quietly add more.
    expect(audit.counts['oriented-finding'] + audit.counts['oriented-back-to-back-finding'])
      .toBeLessThanOrEqual(25);
    expect(ORIENTED_MIN_RACE_AREA_M2).toBe(0.02);
  });
});

describe('nuketown2 HF-536 geometry relief', () => {
  const scene = new THREE.Scene();
  const map = buildNuketown2(scene);
  map.root.updateMatrixWorld(true);
  const box = (name: string): THREE.Box3 => {
    const mesh = map.root.getObjectByName(name);
    expect(mesh, name).toBeTruthy();
    return new THREE.Box3().setFromObject(mesh!);
  };

  it('pulls the upper floor slab back from the exterior wall planes', () => {
    // The north house's west siding face is the building envelope; the slab
    // must stop short of it, not land on it.
    const wall = box('nuketown2 north house wall west upper');
    const slab = box('nuketown2 north house upper floor west front');
    const relief = Math.abs(wall.max.x - slab.max.x);
    expect(relief, 'slab edge vs wall face').toBeGreaterThan(0.015);
    expect(relief, 'the slab still buries itself in the 0.3 m wall').toBeLessThan(0.05);
    // And it must still overlap the wall, or a seam opens.
    expect(slab.max.x).toBeGreaterThan(wall.min.x);
  });

  it('stands the doorway architrave proud of the reveal it lines', () => {
    const partition = box('nuketown2 north house ground partition 0');
    const casing = box('nuketown2 north house ground door casing left');
    // The casing's doorway-side face is inboard of the partition's reveal.
    const proud = Math.abs(casing.min.x - partition.min.x);
    expect(proud).toBeGreaterThan(0.015);
    expect(proud).toBeLessThan(0.05);
  });
});
