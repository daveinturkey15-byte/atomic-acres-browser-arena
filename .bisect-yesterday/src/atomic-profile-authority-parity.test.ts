import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  ATOMIC_HOUSE_AUTHORITY_BINDINGS,
  assertAtomicHouseAuthorityParity,
  auditAtomicHouseAuthorityParity,
} from './atomic-profile-authority-parity';
import { addSemanticHouseInteriors } from './environment-assets';
import { buildArena } from './map';

function authorityAndPerformance(): { authority: THREE.Group; presentation: THREE.Group } {
  const authority = new THREE.Group();
  const presentation = new THREE.Group();
  for (const binding of ATOMIC_HOUSE_AUTHORITY_BINDINGS) {
    const collider = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
    collider.name = binding.colliderId;
    collider.position.set(binding.houseIndex * 3, 0.5, 0);
    collider.visible = false;
    collider.userData.authoredCollisionAuthority = true;
    authority.add(collider);
    const visual = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
    visual.name = binding.performanceNodeId;
    visual.position.copy(collider.position);
    visual.visible = false;
    visual.userData.staticBatchRendered = true;
    visual.userData.authoritativeCollider = binding.colliderId;
    presentation.add(visual);
  }
  return { authority, presentation };
}

describe('Atomic profile authority parity', () => {
  it('keeps one complete canonical semantic binding set for both houses', () => {
    expect(ATOMIC_HOUSE_AUTHORITY_BINDINGS).toHaveLength(22);
    expect(new Set(ATOMIC_HOUSE_AUTHORITY_BINDINGS.map(({ colliderId }) => colliderId)).size).toBe(22);
    expect(ATOMIC_HOUSE_AUTHORITY_BINDINGS.filter(({ semantic }) => semantic === 'kitchen')).toHaveLength(2);
    expect(ATOMIC_HOUSE_AUTHORITY_BINDINGS.filter(({ semantic }) => semantic === 'sofa')).toHaveLength(2);
  });

  it('passes aligned batch-rendered Performance semantics and rejects a missing kitchen', () => {
    const { authority, presentation } = authorityAndPerformance();
    const pass = auditAtomicHouseAuthorityParity(authority, presentation, 'performance');
    expect(pass).toMatchObject({ pass: true, expectedBindings: 22, passedBindings: 22 });
    expect(() => assertAtomicHouseAuthorityParity(pass)).not.toThrow();

    presentation.remove(presentation.getObjectByName('performance-interior-0-kitchen-counter')!);
    const mutation = auditAtomicHouseAuthorityParity(authority, presentation, 'performance');
    expect(mutation.pass).toBe(false);
    expect(mutation.issues).toContain('authored-house-0-kitchen-collider:missing-performance-semantic-node');
    expect(() => assertAtomicHouseAuthorityParity(mutation)).toThrow(/kitchen-collider/);
  });

  it('binds the real mirrored Performance furnishings to the exact canonical colliders', () => {
    const map = buildArena(new THREE.Scene());
    const presentation = new THREE.Group();
    addSemanticHouseInteriors(presentation);
    const report = auditAtomicHouseAuthorityParity(map.root, presentation, 'performance');
    expect(report).toMatchObject({ pass: true, expectedBindings: 22, passedBindings: 22, issues: [] });

    const mirroredChair = presentation.getObjectByName('performance-interior-1-dining-chair-2')!;
    mirroredChair.position.z += 2.1;
    const mutation = auditAtomicHouseAuthorityParity(map.root, presentation, 'performance');
    expect(mutation.pass).toBe(false);
    expect(mutation.issues).toContain('authored-house-1-chair-collider-2:horizontal-centre-drift:2.1');
  });

  it('rejects a sofa substituted onto the Quality kitchen collider', () => {
    const binding = ATOMIC_HOUSE_AUTHORITY_BINDINGS.find(({ houseIndex, semantic }) => houseIndex === 0 && semantic === 'kitchen')!;
    const authority = new THREE.Group();
    const collider = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2), new THREE.MeshBasicMaterial());
    collider.name = binding.colliderId;
    collider.userData.authoredCollisionAuthority = true;
    authority.add(collider);
    const quality = new THREE.Group();
    const marker = new THREE.Group();
    marker.name = binding.qualityAssetSetId;
    marker.userData.atomic_asset_class = 'authored-house-furnishing-set';
    quality.add(marker);
    const sofa = new THREE.Mesh(
      new THREE.BoxGeometry(1.5, 1, 1.5),
      new THREE.MeshStandardMaterial({ name: 'MAT_upholstery_aqua_weave' }),
    );
    quality.add(sofa);
    const mutation = auditAtomicHouseAuthorityParity(authority, quality, 'quality', [binding]);
    expect(mutation.pass).toBe(false);
    expect(mutation.entries[0]).toMatchObject({
      authorityPresent: true,
      qualityAssetSetPresent: true,
      matchingQualityVertices: 0,
      presentationPresent: false,
    });
  });
});
