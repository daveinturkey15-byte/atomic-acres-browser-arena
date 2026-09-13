/**
 * HF-536 night-muse-skirt — ground under the tree belt.
 *
 * The tiled outdoor slab ends at NUKETOWN2_BOUNDS, so from the garage roof the
 * decorative belt stands on nothing (44 of the 46 remaining see-through hits).
 * One presentation-only extruded ring laps under the slab and runs out past
 * the belt. This file pins the brief's four measurements plus the no-authority
 * claim: solid body count and movement collider count identical before/after
 * (removal of the purely additive ring stands in for the before-state).
 */
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { buildNuketown2, NUKETOWN2_GROUND_SKIRT } from './nuketown2-arena';
import { NUKETOWN2_BOUNDS } from './nuketown2-layout';
import { auditNuketown2GroundCoverage } from '../scripts/qa/audit-nuketown2-ground-coverage';

function built(): { map: ReturnType<typeof buildNuketown2>; skirt: THREE.Mesh } {
  const map = buildNuketown2(new THREE.Scene());
  map.root.updateMatrixWorld(true);
  const skirt = map.root.getObjectByName('nuketown2 ground skirt ring') as THREE.Mesh | undefined;
  expect(skirt, 'the ground skirt ring is built').toBeDefined();
  return { map, skirt: skirt! };
}

/** Same predicate as src/nuketown2-fidelity.test.ts solidMeshes (direct children). */
function solidMeshes(map: ReturnType<typeof buildNuketown2>): THREE.Mesh[] {
  return map.root.children.filter((node): node is THREE.Mesh => {
    const mesh = node as THREE.Mesh;
    if (mesh.isMesh !== true) return false;
    if (mesh.userData.presentationOnly === true) return false;
    return (mesh.geometry as THREE.BoxGeometry).parameters !== undefined
      || mesh.userData.nuketown2Solid === true;
  });
}

describe('nuketown2 ground skirt under the tree belt', () => {
  it('sits 0.03 m ± 0.005 below the ground plate top', () => {
    const { map, skirt } = built();
    // The outdoor datum: read off a ground tile rather than re-typed.
    const tile = map.root.children.find(
      (node) => node.name.startsWith('nuketown2 ground tile '),
    ) as THREE.Mesh | undefined;
    expect(tile, 'a ground tile exists').toBeDefined();
    const datum = new THREE.Box3().setFromObject(tile!).max.y;
    expect(datum, 'the outdoor ground datum').toBeCloseTo(0, 6);
    const drop = datum - new THREE.Box3().setFromObject(skirt).max.y;
    expect(drop, 'skirt top below the plate top').toBeGreaterThanOrEqual(0.025);
    expect(drop, 'skirt top below the plate top').toBeLessThanOrEqual(0.035);
  });

  it('laps under the plate by >= 0.02 m on all four sides', () => {
    const skirt = NUKETOWN2_GROUND_SKIRT;
    // East / west: the hole (±innerX) sits 0.02 m inside the slab edge (±18).
    // 1e-9 absorbs binary-float dust on the authored 0.02, nothing more.
    expect(NUKETOWN2_BOUNDS.maxX - skirt.innerX).toBeGreaterThanOrEqual(0.02 - 1e-9);
    expect(-skirt.innerX - NUKETOWN2_BOUNDS.minX).toBeGreaterThanOrEqual(0.02 - 1e-9);
    // North / south: same against ±42.
    expect(NUKETOWN2_BOUNDS.maxZ - skirt.innerZ).toBeGreaterThanOrEqual(0.02 - 1e-9);
    expect(-skirt.innerZ - NUKETOWN2_BOUNDS.minZ).toBeGreaterThanOrEqual(0.02 - 1e-9);
  });
  it('is a real ring: a hole over the map, ground under the belt', () => {
    const { map, skirt } = built();
    const ray = new THREE.Raycaster();
    const down = new THREE.Vector3(0, -1, 0);
    // Arena centre: inside the hole, so the ray must pass the skirt by.
    ray.set(new THREE.Vector3(0, 5, 0), down);
    expect(
      ray.intersectObject(skirt, false).length,
      'no skirt under the arena centre (the hole)',
    ).toBe(0);
    // (50, 0): outside the slab, inside the ring — the belt's own ground.
    ray.set(new THREE.Vector3(50, 5, 0), down);
    const hits = ray.intersectObject(skirt, false);
    expect(hits.length, 'skirt under the belt at (50, 0)').toBeGreaterThan(0);
    expect(hits[0]!.point.y, 'skirt top face height').toBeCloseTo(
      NUKETOWN2_GROUND_SKIRT.topY, 6,
    );
    expect(map, 'map built').toBeDefined();
  });

  it('reaches >= 4 m beyond the belt on every side', () => {
    const { map, skirt } = built();
    // Belt extent, measured on the built forest instances — not re-typed.
    const forest = map.root.getObjectByName('nuketown-forest-surround');
    expect(forest, 'the forest surround is built').toBeDefined();
    const matrix = new THREE.Matrix4();
    const position = new THREE.Vector3();
    const quaternion = new THREE.Quaternion();
    const scale = new THREE.Vector3();
    let beltX = 0;
    let beltZ = 0;
    forest!.traverse((node) => {
      const instanced = node as THREE.InstancedMesh;
      if (instanced.isInstancedMesh !== true) return;
      for (let i = 0; i < instanced.count; i += 1) {
        instanced.getMatrixAt(i, matrix);
        matrix.decompose(position, quaternion, scale);
        beltX = Math.max(beltX, Math.abs(position.x));
        beltZ = Math.max(beltZ, Math.abs(position.z));
      }
    });
    expect(beltX, 'the belt exists').toBeGreaterThan(40);
    const box = new THREE.Box3().setFromObject(skirt);
    expect(-box.min.x, 'skirt west reach').toBeGreaterThanOrEqual(beltX + 4);
    expect(box.max.x, 'skirt east reach').toBeGreaterThanOrEqual(beltX + 4);
    expect(-box.min.z, 'skirt south reach').toBeGreaterThanOrEqual(beltZ + 4);
    expect(box.max.z, 'skirt north reach').toBeGreaterThanOrEqual(beltZ + 4);
  });

  it('closes the margin-40 audit: 0 uncovered cells within the belt footprint', () => {
    const { map } = built();
    const audit = auditNuketown2GroundCoverage(0.25, map.root, 40);
    expect(audit.cellsUncovered, 'no uncovered cell in bounds + 40 m').toBe(0);
    expect(audit.gaps).toEqual([]);
    // And the bounds themselves stay clean on the default call.
    expect(auditNuketown2GroundCoverage().cellsUncovered).toBe(0);
  });

  it('adds no solid body and no movement collider', () => {
    const { map, skirt } = built();
    expect(skirt.userData.presentationOnly).toBe(true);
    expect(skirt.userData.nuketown2Solid ?? false).toBe(false);
    expect(skirt.userData.ballisticSurfaceId).toBeUndefined();
    expect(skirt.castShadow).toBe(false);
    // No collider rides the skirt's own slab band.
    for (const bounds of [...map.colliders, ...map.physicsColliders]) {
      const band =
        Math.abs((bounds.minY ?? 0) - (NUKETOWN2_GROUND_SKIRT.topY - NUKETOWN2_GROUND_SKIRT.thickness)) < 1e-9
        && Math.abs((bounds.maxY ?? 0) - NUKETOWN2_GROUND_SKIRT.topY) < 1e-9;
      expect(band, `no movement collider on the skirt band: ${JSON.stringify(bounds)}`).toBe(false);
    }
    const solidsBefore = solidMeshes(map).length;
    const collidersBefore = map.colliders.length;
    const physicsBefore = map.physicsColliders.length;
    map.root.remove(skirt);
    expect(solidMeshes(map).length, 'solid body count identical before/after').toBe(solidsBefore);
    expect(map.colliders.length, 'movement collider count identical before/after').toBe(collidersBefore);
    expect(map.physicsColliders.length, 'physics collider count identical before/after').toBe(physicsBefore);
  });
});
