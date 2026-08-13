import * as THREE from 'three';

export type ThermalGhostRelation = 'friendly' | 'hostile';

export type ThermalGhostTarget = Readonly<{
  id: string;
  relation: ThermalGhostRelation;
  root: THREE.Object3D;
  /** Presentation-only result from the bounded world-collider visibility test. */
  occluded: boolean;
}>;

export const THERMAL_GHOST_ORANGE_HEX = 0xff7a1a;
export const THERMAL_GHOST_MAX_TARGETS = 16;
// Both retained third-person operator LODs contain nine body primitives. Keep
// three explicit extension slots, then fail closed instead of drawing a
// partial body if a future authored variant exceeds the frozen corpus bound.
export const THERMAL_GHOST_MAX_BODY_LAYERS = 12;
export const THERMAL_GHOST_MAX_OWNED_MATERIALS = 1;
export const THERMAL_GHOST_PRESENTATION_CONTRACT = 'occlusion-conditioned-single-exact-animated-thermal-operator-v2';

export type ThermalGhostTelemetry = Readonly<{
  contract: typeof THERMAL_GHOST_PRESENTATION_CONTRACT;
  trackedTargets: number;
  activeTargets: number;
  occludedTargets: number;
  visibleOriginalTargets: number;
  activeModelLayers: number;
  activeThermalLayers: number;
  /** Retained compatibility field. Pass 71 deliberately owns no second halo. */
  activeHaloLayers: 0;
  activeSourceBodyLayers: number;
  geometryIdentity: boolean;
  skeletonIdentity: boolean;
  bindMatrixIdentity: boolean;
  meshWorldMatrixIdentity: boolean;
  boneWorldMatrixIdentity: boolean;
  silhouetteLayerIdentity: boolean;
  throughGeometry: boolean;
  monochromeThermal: boolean;
  orangeHalo: false;
  treatmentsPerTarget: 0 | 1;
  proxyMeshes: 0;
  maxTargets: number;
  thermalMaterials: 0 | 1;
  /** Retained compatibility field. Source-material clones were removed. */
  exactModelMaterials: 0;
  haloMaterials: 0;
  ownedMaterials: number;
  maxOwnedMaterials: number;
  materialBudgetExceeded: false;
  completeOperatorModels: boolean;
  incompleteTargets: number;
  maxBodyLayers: number;
}>;

type GhostLayer = {
  source: THREE.Mesh;
  model: THREE.Mesh;
};

type GhostRecord = {
  targetId: string;
  relation: ThermalGhostRelation;
  layers: GhostLayer[];
  sourceRoot: THREE.Object3D;
  lastSeenGeneration: number;
  complete: boolean;
  sourceBodyLayers: number;
  occluded: boolean;
};

function thermalMaterial(): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({
    name: 'through-wall-single-thermal-body',
    color: THERMAL_GHOST_ORANGE_HEX,
    transparent: true,
    opacity: 0.9,
    depthTest: false,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
    fog: false,
    side: THREE.DoubleSide,
  });
}

function presentationMesh(source: THREE.Mesh, material: THREE.Material): THREE.Mesh {
  if (source instanceof THREE.SkinnedMesh) {
    const mesh = new THREE.SkinnedMesh(source.geometry, material);
    mesh.bind(source.skeleton, source.bindMatrix);
    mesh.bindMode = source.bindMode;
    mesh.morphTargetInfluences = source.morphTargetInfluences;
    mesh.morphTargetDictionary = source.morphTargetDictionary;
    return mesh;
  }
  const mesh = new THREE.Mesh(source.geometry, material);
  mesh.morphTargetInfluences = source.morphTargetInfluences;
  mesh.morphTargetDictionary = source.morphTargetDictionary;
  return mesh;
}

function effectivelyVisible(source: THREE.Object3D, targetRoot: THREE.Object3D): boolean {
  let cursor: THREE.Object3D | null = source;
  while (cursor) {
    if (!cursor.visible) return false;
    if (cursor === targetRoot) return true;
    cursor = cursor.parent;
  }
  return false;
}

function hasRenderableSourceMaterial(source: THREE.Mesh): boolean {
  const materials = Array.isArray(source.material) ? source.material : [source.material];
  return materials.some((material) => material.visible && material.colorWrite);
}

function matrixEquals(left: THREE.Matrix4, right: THREE.Matrix4, tolerance = 1e-9): boolean {
  for (let index = 0; index < 16; index += 1) {
    if (Math.abs(left.elements[index]! - right.elements[index]!) > tolerance) return false;
  }
  return true;
}

function sharedBoneWorldMatricesMatch(source: THREE.SkinnedMesh, model: THREE.SkinnedMesh): boolean {
  if (model.skeleton.bones.length !== source.skeleton.bones.length) return false;
  for (let index = 0; index < source.skeleton.bones.length; index += 1) {
    const sourceBone = source.skeleton.bones[index]!;
    const modelBone = model.skeleton.bones[index]!;
    if (sourceBone !== modelBone || !matrixEquals(sourceBone.matrixWorld, modelBone.matrixWorld)) return false;
  }
  return true;
}

/**
 * Copies the source mesh's local transform onto a sibling clone. Making the
 * clone a child of the SkinnedMesh used to apply the source transform twice to
 * bind-space vertices, which is the duplicate/misaligned body reported by the
 * owner. A sibling shares the exact parent, geometry and live skeleton.
 */
function syncSiblingTransform(layer: GhostLayer): void {
  const { source, model } = layer;
  if (source.matrixAutoUpdate) source.updateMatrix();
  model.matrix.copy(source.matrix);
  model.matrixWorldNeedsUpdate = true;
  if (source.morphTargetInfluences && model.morphTargetInfluences !== source.morphTargetInfluences) {
    model.morphTargetInfluences = source.morphTargetInfluences;
  }
}

/**
 * Presentation-only renderer for one exact animated thermal body. The original
 * operator is left untouched and therefore renders normally while visible.
 * Only an authority-approved, world-occluded target receives the single
 * depth-bypassing thermal treatment; there is no pawn, copied normal model, or
 * expanded halo layer to stack over the live rig.
 */
export class ThermalGhostPresentation {
  private readonly records = new Map<string, GhostRecord>();
  private readonly sharedThermalMaterial = thermalMaterial();
  private generation = 0;
  private activeTargets = 0;
  private occludedTargets = 0;
  private visibleOriginalTargets = 0;
  private activeModelLayers = 0;
  private activeSourceBodyLayers = 0;
  private thermalMaterialDisposed = false;

  private buildGhost(target: ThermalGhostTarget): GhostRecord {
    const layers: GhostLayer[] = [];
    target.root.updateWorldMatrix(true, false);
    const operatorVisual = target.root.getObjectByName('rigged-operator-visual') ?? target.root;
    const sourceBodyMeshes: THREE.Mesh[] = [];
    let unsupportedInstancedBody = false;
    operatorVisual.traverse((node) => {
      if (node.userData.thermalGhost === true) return;
      if (!(node instanceof THREE.Mesh)) return;
      if (node instanceof THREE.InstancedMesh) {
        unsupportedInstancedBody = true;
        return;
      }
      sourceBodyMeshes.push(node);
    });
    const complete = !unsupportedInstancedBody
      && sourceBodyMeshes.length > 0
      && sourceBodyMeshes.length <= THERMAL_GHOST_MAX_BODY_LAYERS;
    if (complete) {
      for (const source of sourceBodyMeshes) {
        const parent = source.parent;
        if (!parent) continue;
        const model = presentationMesh(source, this.sharedThermalMaterial);
        model.name = 'through-wall-single-thermal-operator-model';
        model.userData.thermalGhost = true;
        model.userData.presentationOnly = true;
        model.userData.authority = 'none';
        model.userData.treatment = 'single-monochrome-thermal';
        model.matrixAutoUpdate = false;
        model.frustumCulled = false;
        model.renderOrder = 998;
        model.castShadow = false;
        model.receiveShadow = false;
        model.raycast = () => undefined;
        const layer = { source, model };
        syncSiblingTransform(layer);
        parent.add(model);
        layers.push(layer);
      }
    }
    const record: GhostRecord = {
      targetId: target.id,
      relation: target.relation,
      layers,
      sourceRoot: target.root,
      lastSeenGeneration: this.generation,
      complete: complete && layers.length === sourceBodyMeshes.length,
      sourceBodyLayers: sourceBodyMeshes.length,
      occluded: target.occluded,
    };
    if (!record.complete) this.releaseRecord(record);
    return record;
  }

  private releaseRecord(record: GhostRecord): void {
    for (const layer of record.layers) layer.model.removeFromParent();
    record.layers.length = 0;
  }

  /** Show one thermal treatment for exactly the occluded approved target set. */
  sync(targets: readonly ThermalGhostTarget[], active: boolean): void {
    this.generation += 1;
    this.activeTargets = 0;
    this.occludedTargets = 0;
    this.visibleOriginalTargets = 0;
    this.activeModelLayers = 0;
    this.activeSourceBodyLayers = 0;
    if (active) {
      const admitted: ThermalGhostTarget[] = [];
      const seenIds = new Set<string>();
      for (const target of targets) {
        if (seenIds.has(target.id)) continue;
        seenIds.add(target.id);
        admitted.push(target);
        if (admitted.length === THERMAL_GHOST_MAX_TARGETS) break;
      }
      const admittedIds = new Set(admitted.map((target) => target.id));
      for (const target of admitted) {
        let record = this.records.get(target.id);
        if (record && record.sourceRoot !== target.root) {
          this.releaseRecord(record);
          this.records.delete(target.id);
          record = undefined;
        }
        if (!record) {
          if (this.records.size >= THERMAL_GHOST_MAX_TARGETS) {
            const evicted = [...this.records.entries()]
              .filter(([id]) => !admittedIds.has(id))
              .sort((left, right) => left[1].lastSeenGeneration - right[1].lastSeenGeneration)[0];
            if (evicted) {
              this.releaseRecord(evicted[1]);
              this.records.delete(evicted[0]);
            }
          }
          record = this.buildGhost(target);
          this.records.set(target.id, record);
        }
        record.relation = target.relation;
        record.occluded = target.occluded;
        record.lastSeenGeneration = this.generation;
        if (!target.occluded) this.visibleOriginalTargets += 1;
        else this.occludedTargets += 1;
        let visibleLayers = 0;
        for (const layer of record.layers) {
          syncSiblingTransform(layer);
          const visible = target.occluded
            && effectivelyVisible(layer.source, record.sourceRoot)
            && hasRenderableSourceMaterial(layer.source);
          layer.model.visible = visible;
          if (!visible) continue;
          visibleLayers += 1;
          this.activeSourceBodyLayers += 1;
          this.activeModelLayers += 1;
        }
        if (visibleLayers > 0) this.activeTargets += 1;
      }
    }
    for (const [id, record] of this.records) {
      if (record.lastSeenGeneration === this.generation && active) continue;
      for (const layer of record.layers) layer.model.visible = false;
      if (!record.sourceRoot.parent) {
        this.releaseRecord(record);
        this.records.delete(id);
      }
    }
  }

  clear(): void {
    for (const record of this.records.values()) this.releaseRecord(record);
    this.records.clear();
    this.activeTargets = 0;
    this.occludedTargets = 0;
    this.visibleOriginalTargets = 0;
    this.activeModelLayers = 0;
    this.activeSourceBodyLayers = 0;
  }

  telemetry(): ThermalGhostTelemetry {
    let geometryIdentity = true;
    let skeletonIdentity = true;
    let bindMatrixIdentity = true;
    let meshWorldMatrixIdentity = true;
    let boneWorldMatrixIdentity = true;
    let throughGeometry = this.activeModelLayers > 0;
    let monochromeThermal = this.activeModelLayers > 0;
    let completeOperatorModels = true;
    let incompleteTargets = 0;
    for (const record of this.records.values()) {
      completeOperatorModels &&= record.complete;
      if (!record.complete) incompleteTargets += 1;
      for (const layer of record.layers) {
        layer.source.updateWorldMatrix(true, false);
        layer.model.updateWorldMatrix(true, false);
        meshWorldMatrixIdentity &&= matrixEquals(layer.source.matrixWorld, layer.model.matrixWorld);
        geometryIdentity &&= layer.model.geometry === layer.source.geometry;
        if (layer.source instanceof THREE.SkinnedMesh) {
          const model = layer.model instanceof THREE.SkinnedMesh ? layer.model : null;
          skeletonIdentity &&= model !== null && model.skeleton === layer.source.skeleton;
          bindMatrixIdentity &&= model !== null
            && matrixEquals(model.bindMatrix, layer.source.bindMatrix)
            && model.bindMode === layer.source.bindMode;
          boneWorldMatrixIdentity &&= model !== null && sharedBoneWorldMatricesMatch(layer.source, model);
        }
        throughGeometry &&= !this.sharedThermalMaterial.depthTest && !this.sharedThermalMaterial.depthWrite;
        monochromeThermal &&= layer.model.material === this.sharedThermalMaterial
          && this.sharedThermalMaterial.color.getHex() === THERMAL_GHOST_ORANGE_HEX;
      }
    }
    const thermalMaterials = this.thermalMaterialDisposed ? 0 : 1;
    return Object.freeze({
      contract: THERMAL_GHOST_PRESENTATION_CONTRACT,
      trackedTargets: this.records.size,
      activeTargets: this.activeTargets,
      occludedTargets: this.occludedTargets,
      visibleOriginalTargets: this.visibleOriginalTargets,
      activeModelLayers: this.activeModelLayers,
      activeThermalLayers: this.activeModelLayers,
      activeHaloLayers: 0,
      activeSourceBodyLayers: this.activeSourceBodyLayers,
      geometryIdentity,
      skeletonIdentity,
      bindMatrixIdentity,
      meshWorldMatrixIdentity,
      boneWorldMatrixIdentity,
      silhouetteLayerIdentity: this.activeSourceBodyLayers === this.activeModelLayers,
      throughGeometry,
      monochromeThermal,
      orangeHalo: false,
      treatmentsPerTarget: this.activeTargets > 0 ? 1 : 0,
      proxyMeshes: 0,
      maxTargets: THERMAL_GHOST_MAX_TARGETS,
      thermalMaterials,
      exactModelMaterials: 0,
      haloMaterials: 0,
      ownedMaterials: thermalMaterials,
      maxOwnedMaterials: THERMAL_GHOST_MAX_OWNED_MATERIALS,
      materialBudgetExceeded: false,
      completeOperatorModels,
      incompleteTargets,
      maxBodyLayers: THERMAL_GHOST_MAX_BODY_LAYERS,
    });
  }

  terminalDispose(): void {
    this.clear();
    if (!this.thermalMaterialDisposed) {
      this.sharedThermalMaterial.dispose();
      this.thermalMaterialDisposed = true;
    }
  }
}
