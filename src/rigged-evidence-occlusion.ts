import * as THREE from 'three';

export const RIGGED_EVIDENCE_OCCLUDER_MINIMUM_OPACITY = 0.75;

export type RiggedEvidenceCaptureTarget = Readonly<{
  kind: 'bot' | 'training-dummy';
  id: string;
}>;

export function validateRiggedEvidenceCaptureTargets(
  input: unknown,
  actorExists: (kind: RiggedEvidenceCaptureTarget['kind'], id: string) => boolean,
  maximumTargets = 4,
): Readonly<{ valid: boolean; targets: readonly RiggedEvidenceCaptureTarget[] | null }> {
  if (!Array.isArray(input) || input.length > maximumTargets) {
    return Object.freeze({ valid: false, targets: null });
  }
  if (input.length === 0) return Object.freeze({ valid: true, targets: null });
  const identities = new Set<string>();
  const targets: RiggedEvidenceCaptureTarget[] = [];
  for (const candidate of input) {
    if (candidate === null || typeof candidate !== 'object') {
      return Object.freeze({ valid: false, targets: null });
    }
    const { kind, id } = candidate as { kind?: unknown; id?: unknown };
    if ((kind !== 'bot' && kind !== 'training-dummy') || typeof id !== 'string' || id.length === 0) {
      return Object.freeze({ valid: false, targets: null });
    }
    const identity = `${kind}:${id}`;
    if (identities.has(identity) || !actorExists(kind, id)) {
      return Object.freeze({ valid: false, targets: null });
    }
    identities.add(identity);
    targets.push(Object.freeze({ kind, id }));
  }
  return Object.freeze({ valid: true, targets: Object.freeze(targets) });
}

export function riggedEvidenceMaterialCanOcclude(material: THREE.Material | undefined): boolean {
  return material !== undefined
    && material.visible
    && material.colorWrite
    && (!material.transparent || material.opacity >= RIGGED_EVIDENCE_OCCLUDER_MINIMUM_OPACITY);
}

export function riggedEvidenceIntersectionCanOcclude(intersection: THREE.Intersection): boolean {
  if (!(intersection.object instanceof THREE.Mesh)) return false;
  const { material } = intersection.object;
  if (!Array.isArray(material)) return riggedEvidenceMaterialCanOcclude(material);
  const materialIndex = intersection.face?.materialIndex;
  return Number.isInteger(materialIndex)
    && riggedEvidenceMaterialCanOcclude(material[materialIndex!]);
}

export function firstRiggedEvidenceOccluder(
  intersections: readonly THREE.Intersection[],
): THREE.Intersection | null {
  return intersections.find(riggedEvidenceIntersectionCanOcclude) ?? null;
}

export function riggedEvidenceObjectDescendsFrom(
  node: THREE.Object3D,
  ancestor: THREE.Object3D,
): boolean {
  let cursor: THREE.Object3D | null = node;
  while (cursor) {
    if (cursor === ancestor) return true;
    cursor = cursor.parent;
  }
  return false;
}

export function collectRiggedEvidenceOccluders(
  scene: THREE.Object3D,
  camera: THREE.Camera,
  actorRoot: THREE.Object3D,
  isRenderableOccluder: (node: THREE.Object3D) => boolean,
): THREE.Object3D[] {
  const occluders: THREE.Object3D[] = [];
  scene.traverse((node) => {
    if (!isRenderableOccluder(node)
      || riggedEvidenceObjectDescendsFrom(node, actorRoot)
      || riggedEvidenceObjectDescendsFrom(node, camera)) return;
    occluders.push(node);
  });
  return occluders;
}
