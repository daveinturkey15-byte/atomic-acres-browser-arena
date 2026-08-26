import * as THREE from 'three';
import { HOUSE_LAYOUT } from './arena-layout';

export type AtomicPresentationProfile = 'performance' | 'quality' | 'quality-fallback';

type AtomicHouseSemanticDefinition = Readonly<{
  semantic: 'dining' | 'chair' | 'sofa' | 'kitchen' | 'coffee-table' | 'media' | 'upper-bed' | 'upper-desk';
  performanceNode: string;
  qualityMaterialFragments: readonly string[];
  minimumQualityVertices: number;
}>;

export type AtomicHouseAuthorityBinding = Readonly<{
  houseIndex: number;
  houseVariant: 'aqua' | 'coral';
  semantic: AtomicHouseSemanticDefinition['semantic'];
  colliderId: string;
  performanceNodeId: string;
  qualityAssetSetId: string;
  qualityMaterialFragments: readonly string[];
  minimumQualityVertices: number;
}>;

export type AtomicHouseAuthorityParityEntry = Readonly<{
  colliderId: string;
  semantic: AtomicHouseSemanticDefinition['semantic'];
  authorityPresent: boolean;
  presentationPresent: boolean;
  presentationBoundToAuthority: boolean;
  horizontalCentreErrorMetres: number | null;
  qualityAssetSetPresent: boolean | null;
  matchingQualityMeshes: number;
  matchingQualityVertices: number;
  issues: readonly string[];
}>;

export type AtomicHouseAuthorityParityReport = Readonly<{
  schema: 'atomic-acres/house-profile-authority-parity@1';
  profile: AtomicPresentationProfile;
  expectedBindings: number;
  passedBindings: number;
  pass: boolean;
  issues: readonly string[];
  entries: readonly AtomicHouseAuthorityParityEntry[];
}>;

const SHARED_DEFINITIONS: readonly AtomicHouseSemanticDefinition[] = Object.freeze([
  Object.freeze({
    semantic: 'dining', performanceNode: 'dining-table',
    qualityMaterialFragments: Object.freeze(['timber_dark', 'brushed_alloy', 'trim_bone']), minimumQualityVertices: 8,
  }),
  ...Array.from({ length: 4 }, (_, chairIndex): AtomicHouseSemanticDefinition => Object.freeze({
    semantic: 'chair', performanceNode: `dining-chair-${chairIndex}`,
    qualityMaterialFragments: Object.freeze(['upholstery_', 'gunmetal']), minimumQualityVertices: 8,
  })),
  Object.freeze({
    semantic: 'sofa', performanceNode: 'sofa-seat',
    qualityMaterialFragments: Object.freeze(['upholstery_', 'timber_dark']), minimumQualityVertices: 8,
  }),
  Object.freeze({
    semantic: 'kitchen', performanceNode: 'kitchen-counter',
    // Intentionally excludes upholstery/timber. A sofa moved onto the galley
    // collider cannot satisfy the Quality profile's semantic material proof.
    qualityMaterialFragments: Object.freeze(['trim_bone', 'boundary_warm_concrete', 'brushed_alloy']), minimumQualityVertices: 8,
  }),
  Object.freeze({
    semantic: 'coffee-table', performanceNode: 'coffee-table',
    qualityMaterialFragments: Object.freeze(['timber_dark', 'gunmetal']), minimumQualityVertices: 8,
  }),
  Object.freeze({
    semantic: 'media', performanceNode: 'media-console',
    qualityMaterialFragments: Object.freeze(['timber_dark', 'gunmetal', 'emissive_aqua', 'rubber']), minimumQualityVertices: 8,
  }),
  Object.freeze({
    semantic: 'upper-bed', performanceNode: 'bed-frame',
    qualityMaterialFragments: Object.freeze(['timber_dark', 'bedding_neutral', 'upholstery_']), minimumQualityVertices: 8,
  }),
  Object.freeze({
    semantic: 'upper-desk', performanceNode: 'workstation-desk',
    qualityMaterialFragments: Object.freeze(['timber_dark', 'brushed_alloy', 'gunmetal', 'emissive_aqua']), minimumQualityVertices: 8,
  }),
]);

function colliderSuffix(definition: AtomicHouseSemanticDefinition, ordinal: number): string {
  return definition.semantic === 'chair' ? `chair-collider-${ordinal - 1}` : `${definition.semantic}-collider`;
}

/**
 * Canonical cross-profile semantic roster. Adding a substantial house collider
 * without a corresponding presentation binding changes this projection and
 * fails both the unit mutation gate and deployed profile audit.
 */
export const ATOMIC_HOUSE_AUTHORITY_BINDINGS: readonly AtomicHouseAuthorityBinding[] = Object.freeze(
  HOUSE_LAYOUT.flatMap((house, houseIndex) => SHARED_DEFINITIONS.map((definition, ordinal) => Object.freeze({
    houseIndex,
    houseVariant: house.team === 0 ? 'aqua' as const : 'coral' as const,
    semantic: definition.semantic,
    colliderId: `authored-house-${houseIndex}-${colliderSuffix(definition, ordinal)}`,
    performanceNodeId: `performance-interior-${houseIndex}-${definition.performanceNode}`,
    qualityAssetSetId: `P32_FURN_${house.team === 0 ? 'AQUA' : 'CORAL'}_ASSET_SET`,
    qualityMaterialFragments: definition.qualityMaterialFragments,
    minimumQualityVertices: definition.minimumQualityVertices,
  }))),
);

function meshWorldBounds(mesh: THREE.Mesh): THREE.Box3 | null {
  const position = mesh.geometry.getAttribute('position');
  if (!position || position.count === 0) return null;
  if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
  return mesh.geometry.boundingBox?.clone().applyMatrix4(mesh.matrixWorld) ?? null;
}

function normalizedMaterialNames(mesh: THREE.Mesh): readonly string[] {
  const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  return materials.map((material) => material.name.toLowerCase());
}

function qualityGeometryCoverage(
  root: THREE.Object3D,
  authorityBounds: THREE.Box3,
  materialFragments: readonly string[],
): Readonly<{ meshes: number; vertices: number }> {
  const probe = authorityBounds.clone().expandByScalar(0.08);
  let meshes = 0;
  let vertices = 0;
  const world = new THREE.Vector3();
  root.traverse((node) => {
    if (!(node instanceof THREE.Mesh) || !node.visible) return;
    const materialNames = normalizedMaterialNames(node);
    if (!materialNames.some((name) => materialFragments.some((fragment) => name.includes(fragment)))) return;
    const bounds = meshWorldBounds(node);
    if (!bounds?.intersectsBox(probe)) return;
    const position = node.geometry.getAttribute('position');
    let matchedVertices = 0;
    for (let index = 0; index < position.count; index += 1) {
      world.fromBufferAttribute(position, index).applyMatrix4(node.matrixWorld);
      if (probe.containsPoint(world)) matchedVertices += 1;
    }
    if (matchedVertices > 0) {
      meshes += 1;
      vertices += matchedVertices;
    }
  });
  return Object.freeze({ meshes, vertices });
}

function horizontalCentreError(authority: THREE.Object3D, presentation: THREE.Object3D): number {
  const authorityPosition = authority.getWorldPosition(new THREE.Vector3());
  const presentationPosition = presentation.getWorldPosition(new THREE.Vector3());
  return Math.hypot(authorityPosition.x - presentationPosition.x, authorityPosition.z - presentationPosition.z);
}

export function auditAtomicHouseAuthorityParity(
  authorityRoot: THREE.Object3D,
  presentationRoot: THREE.Object3D,
  profile: AtomicPresentationProfile,
  bindings: readonly AtomicHouseAuthorityBinding[] = ATOMIC_HOUSE_AUTHORITY_BINDINGS,
): AtomicHouseAuthorityParityReport {
  authorityRoot.updateWorldMatrix(true, true);
  presentationRoot.updateWorldMatrix(true, true);
  const entries = bindings.map((binding): AtomicHouseAuthorityParityEntry => {
    const issues: string[] = [];
    const authority = authorityRoot.getObjectByName(binding.colliderId);
    const authorityPresent = authority instanceof THREE.Mesh
      && authority.userData.authoredCollisionAuthority === true;
    if (!authorityPresent) issues.push('missing-authoritative-collider');

    let presentationPresent = false;
    let presentationBoundToAuthority = false;
    let horizontalCentreErrorMetres: number | null = null;
    let qualityAssetSetPresent: boolean | null = null;
    let matchingQualityMeshes = 0;
    let matchingQualityVertices = 0;

    if (profile === 'quality') {
      const assetSet = presentationRoot.getObjectByName(binding.qualityAssetSetId);
      qualityAssetSetPresent = assetSet?.userData.atomic_asset_class === 'authored-house-furnishing-set';
      if (!qualityAssetSetPresent) issues.push('missing-quality-furnishing-set');
      const authorityBounds = authority instanceof THREE.Mesh ? meshWorldBounds(authority) : null;
      if (authorityBounds) {
        const coverage = qualityGeometryCoverage(presentationRoot, authorityBounds, binding.qualityMaterialFragments);
        matchingQualityMeshes = coverage.meshes;
        matchingQualityVertices = coverage.vertices;
        presentationPresent = coverage.vertices >= binding.minimumQualityVertices;
        presentationBoundToAuthority = presentationPresent;
      }
      if (!presentationPresent) {
        issues.push(`quality-semantic-geometry-missing:${matchingQualityVertices}/${binding.minimumQualityVertices}`);
      }
    } else {
      const presentation = presentationRoot.getObjectByName(binding.performanceNodeId);
      presentationPresent = presentation instanceof THREE.Mesh;
      if (!presentationPresent) issues.push('missing-performance-semantic-node');
      if (presentation) {
        presentationBoundToAuthority = presentation.userData.authoritativeCollider === binding.colliderId
          && (presentation.visible || presentation.userData.staticBatchRendered === true);
        if (!presentationBoundToAuthority) issues.push('performance-semantic-not-render-bound');
      }
      if (authority && presentation) {
        horizontalCentreErrorMetres = Number(horizontalCentreError(authority, presentation).toFixed(4));
        if (horizontalCentreErrorMetres > 0.12) issues.push(`horizontal-centre-drift:${horizontalCentreErrorMetres}`);
      }
    }

    return Object.freeze({
      colliderId: binding.colliderId,
      semantic: binding.semantic,
      authorityPresent,
      presentationPresent,
      presentationBoundToAuthority,
      horizontalCentreErrorMetres,
      qualityAssetSetPresent,
      matchingQualityMeshes,
      matchingQualityVertices,
      issues: Object.freeze(issues),
    });
  });
  const issues = entries.flatMap((entry) => entry.issues.map((issue) => `${entry.colliderId}:${issue}`));
  return Object.freeze({
    schema: 'atomic-acres/house-profile-authority-parity@1',
    profile,
    expectedBindings: entries.length,
    passedBindings: entries.filter((entry) => entry.issues.length === 0).length,
    pass: issues.length === 0,
    issues: Object.freeze(issues),
    entries: Object.freeze(entries),
  });
}

export function assertAtomicHouseAuthorityParity(report: AtomicHouseAuthorityParityReport): void {
  if (!report.pass) {
    throw new Error(`Atomic house profile authority parity failed (${report.profile}): ${report.issues.join(', ')}`);
  }
}
