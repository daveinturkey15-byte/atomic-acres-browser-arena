import * as THREE from 'three';

export type ThermalGhostRelation = 'friendly' | 'hostile';

export type ThermalGhostTarget = Readonly<{
  id: string;
  relation: ThermalGhostRelation;
  root: THREE.Object3D;
}>;

export const THERMAL_GHOST_ORANGE_HEX = 0xff7a1a;
export const THERMAL_GHOST_MAX_TARGETS = 16;
// Both retained third-person operator LODs contain nine body primitives. Keep
// three explicit extension slots, then fail closed instead of drawing a
// partial body if a future authored variant exceeds the frozen corpus bound.
export const THERMAL_GHOST_MAX_BODY_LAYERS = 12;
// The retained operator corpus owns four shared appearance materials per
// instance. Five slots per admitted target leaves one bounded extension slot
// without allowing target churn to create hundreds of live bind groups.
export const THERMAL_GHOST_MAX_EXACT_MODEL_MATERIALS = THERMAL_GHOST_MAX_TARGETS * 5;
export const THERMAL_GHOST_MAX_OWNED_MATERIALS = THERMAL_GHOST_MAX_EXACT_MODEL_MATERIALS + 1;
export const THERMAL_GHOST_HALO_SCALE = 1.045;
export const THERMAL_GHOST_PRESENTATION_CONTRACT = 'exact-animated-operator-plus-orange-halo-v1';

export type ThermalGhostTelemetry = Readonly<{
  contract: typeof THERMAL_GHOST_PRESENTATION_CONTRACT;
  trackedTargets: number;
  activeTargets: number;
  activeModelLayers: number;
  activeHaloLayers: number;
  geometryIdentity: boolean;
  skeletonIdentity: boolean;
  throughGeometry: boolean;
  orangeHalo: boolean;
  proxyMeshes: 0;
  maxTargets: number;
  exactModelMaterials: number;
  haloMaterials: 0 | 1;
  ownedMaterials: number;
  maxOwnedMaterials: number;
  materialBudgetExceeded: boolean;
  completeOperatorModels: boolean;
  incompleteTargets: number;
  maxBodyLayers: number;
}>;

type GhostLayer = {
  source: THREE.Mesh;
  model: THREE.Mesh;
  halo: THREE.Mesh;
  sourceMaterials: THREE.Material[];
};

type ExactMaterialLease = {
  material: THREE.Material;
  references: number;
};

type GhostRecord = {
  targetId: string;
  relation: ThermalGhostRelation;
  layers: GhostLayer[];
  sourceRoot: THREE.Object3D;
  lastSeenGeneration: number;
  complete: boolean;
  sourceBodyLayers: number;
};

function sourceMaterials(source: THREE.Mesh): THREE.Material[] {
  return Array.isArray(source.material) ? source.material : [source.material];
}

function orangeHaloMaterial(): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({
    name: 'through-wall-operator-orange-halo',
    color: THERMAL_GHOST_ORANGE_HEX,
    transparent: true,
    opacity: 0.88,
    depthTest: false,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
    side: THREE.BackSide,
  });
}

function presentationMesh(source: THREE.Mesh, material: THREE.Material | THREE.Material[]): THREE.Mesh {
  if (source instanceof THREE.SkinnedMesh) {
    const mesh = new THREE.SkinnedMesh(source.geometry, material);
    mesh.bind(source.skeleton, source.bindMatrix);
    mesh.bindMode = source.bindMode;
    return mesh;
  }
  return new THREE.Mesh(source.geometry, material);
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
  return sourceMaterials(source).some((material) => material.visible && material.colorWrite);
}

/**
 * Re-renders each admitted combatant's real operator meshes through occluders.
 * The first layer retains the source model's exact materials, geometry and live
 * skeleton. A slightly expanded back-face layer adds only the requested orange
 * edge glow. Neither layer raycasts or owns target eligibility, animation,
 * collision, hitboxes, teams, damage or any other gameplay state.
 */
export class ThermalGhostPresentation {
  private readonly records = new Map<string, GhostRecord>();
  private readonly exactMaterialCache = new WeakMap<THREE.Material, ExactMaterialLease>();
  private readonly ownedExactMaterials = new Set<THREE.Material>();
  private readonly sharedHaloMaterial = orangeHaloMaterial();
  private generation = 0;
  private activeTargets = 0;
  private activeModelLayers = 0;
  private activeHaloLayers = 0;
  private materialBudgetExceeded = false;
  private haloMaterialDisposed = false;

  private acquireExactModelMaterials(source: THREE.Mesh): THREE.Material[] | null {
    const originals = sourceMaterials(source);
    const missing = new Set(originals.filter((material) => !this.exactMaterialCache.has(material)));
    if (this.ownedExactMaterials.size + missing.size > THERMAL_GHOST_MAX_EXACT_MODEL_MATERIALS) {
      this.materialBudgetExceeded = true;
      return null;
    }
    return originals.map((material) => {
      let lease = this.exactMaterialCache.get(material);
      if (!lease) {
        const clone = material.clone();
        clone.name = `through-wall-exact:${material.name || material.type}`;
        clone.depthTest = false;
        clone.depthWrite = false;
        clone.clippingPlanes = null;
        clone.needsUpdate = true;
        lease = { material: clone, references: 0 };
        this.exactMaterialCache.set(material, lease);
        this.ownedExactMaterials.add(clone);
      }
      lease.references += 1;
      return lease.material;
    });
  }

  private releaseExactModelMaterials(materials: readonly THREE.Material[]): void {
    for (const source of materials) {
      const lease = this.exactMaterialCache.get(source);
      if (!lease) continue;
      lease.references -= 1;
      if (lease.references > 0) continue;
      this.exactMaterialCache.delete(source);
      this.ownedExactMaterials.delete(lease.material);
      lease.material.dispose();
    }
  }

  private buildGhosts(target: ThermalGhostTarget): GhostRecord {
    const layers: GhostLayer[] = [];
    target.root.updateWorldMatrix(true, false);
    // Attached guns, haze and shadow proxies are not the operator body. The
    // named rigged visual is the exact animated model authority when present;
    // the target root remains the deterministic test/fallback boundary.
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
    const requiredNewMaterials = new Set(
      sourceBodyMeshes.flatMap((mesh) => sourceMaterials(mesh))
        .filter((material) => !this.exactMaterialCache.has(material)),
    ).size;
    const complete = !unsupportedInstancedBody
      && sourceBodyMeshes.length > 0
      && sourceBodyMeshes.length <= THERMAL_GHOST_MAX_BODY_LAYERS
      && this.ownedExactMaterials.size + requiredNewMaterials <= THERMAL_GHOST_MAX_EXACT_MODEL_MATERIALS;
    if (!complete && this.ownedExactMaterials.size + requiredNewMaterials > THERMAL_GHOST_MAX_EXACT_MODEL_MATERIALS) {
      this.materialBudgetExceeded = true;
    }
    if (complete) for (const node of sourceBodyMeshes) {
      const sourceLayerMaterials = sourceMaterials(node);
      const modelMaterials = this.acquireExactModelMaterials(node);
      // The complete-record preflight above makes this unreachable unless a
      // caller mutates the material graph during synchronous construction.
      if (!modelMaterials) break;
      const model = presentationMesh(node, Array.isArray(node.material) ? modelMaterials : modelMaterials[0]);
      const halo = presentationMesh(node, this.sharedHaloMaterial);
      this.prepareLayer(model, 'through-wall-exact-operator-model', 998, 1);
      this.prepareLayer(halo, 'through-wall-operator-orange-halo', 999, THERMAL_GHOST_HALO_SCALE);
      node.add(model, halo);
      layers.push({ source: node, model, halo, sourceMaterials: sourceLayerMaterials });
    }
    const record: GhostRecord = {
      targetId: target.id,
      relation: target.relation,
      layers,
      sourceRoot: target.root,
      lastSeenGeneration: this.generation,
      complete: complete && layers.length === sourceBodyMeshes.length,
      sourceBodyLayers: sourceBodyMeshes.length,
    };
    if (!record.complete && record.layers.length > 0) this.releaseRecord(record);
    return record;
  }

  private prepareLayer(mesh: THREE.Mesh, name: string, renderOrder: number, scale: number): void {
    mesh.name = name;
    mesh.userData.thermalGhost = true;
    mesh.userData.presentationOnly = true;
    mesh.userData.authority = 'none';
    mesh.matrixAutoUpdate = false;
    mesh.matrix.identity();
    mesh.scale.setScalar(scale);
    mesh.updateMatrix();
    mesh.frustumCulled = false;
    mesh.renderOrder = renderOrder;
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    mesh.raycast = () => undefined;
  }

  private releaseRecord(record: GhostRecord): void {
    for (const layer of record.layers) {
      layer.model.removeFromParent();
      layer.halo.removeFromParent();
      this.releaseExactModelMaterials(layer.sourceMaterials);
    }
    record.layers.length = 0;
  }

  /** Show exact-model layers for exactly the authority-approved target set. */
  sync(targets: readonly ThermalGhostTarget[], active: boolean): void {
    this.generation += 1;
    this.activeTargets = 0;
    this.activeModelLayers = 0;
    this.activeHaloLayers = 0;
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
          record = this.buildGhosts(target);
          this.records.set(target.id, record);
        }
        // Relationship controls eligibility upstream, never appearance. An
        // allegiance transition must not rebuild identical model/halo layers.
        record.relation = target.relation;
        record.lastSeenGeneration = this.generation;
        let visibleLayers = 0;
        for (const layer of record.layers) {
          // A child-visible flag alone false-greens hidden LODs and materials.
          // Mirror the renderer's effective source visibility to the admitted
          // root and require at least one color-writing material.
          const visible = effectivelyVisible(layer.source, record.sourceRoot)
            && hasRenderableSourceMaterial(layer.source);
          layer.model.visible = visible;
          layer.halo.visible = visible;
          if (!visible) continue;
          visibleLayers += 1;
          this.activeModelLayers += 1;
          this.activeHaloLayers += 1;
        }
        if (visibleLayers > 0) this.activeTargets += 1;
      }
    }
    for (const [id, record] of this.records) {
      if (record.lastSeenGeneration === this.generation && active) continue;
      for (const layer of record.layers) {
        layer.model.visible = false;
        layer.halo.visible = false;
      }
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
    this.activeModelLayers = 0;
    this.activeHaloLayers = 0;
    this.materialBudgetExceeded = false;
  }

  telemetry(): ThermalGhostTelemetry {
    let geometryIdentity = true;
    let skeletonIdentity = true;
    let throughGeometry = this.activeModelLayers > 0;
    let orangeHalo = this.activeHaloLayers > 0;
    let completeOperatorModels = true;
    let incompleteTargets = 0;
    for (const record of this.records.values()) {
      completeOperatorModels &&= record.complete;
      if (!record.complete) incompleteTargets += 1;
      for (const layer of record.layers) {
        geometryIdentity &&= layer.model.geometry === layer.source.geometry
          && layer.halo.geometry === layer.source.geometry;
        if (layer.source instanceof THREE.SkinnedMesh) {
          skeletonIdentity &&= layer.model instanceof THREE.SkinnedMesh
            && layer.halo instanceof THREE.SkinnedMesh
            && layer.model.skeleton === layer.source.skeleton
            && layer.halo.skeleton === layer.source.skeleton;
        }
        const materials = [
          ...(Array.isArray(layer.model.material) ? layer.model.material : [layer.model.material]),
          ...(Array.isArray(layer.halo.material) ? layer.halo.material : [layer.halo.material]),
        ];
        throughGeometry &&= materials.every((material) => material.depthTest === false && material.depthWrite === false);
        const halo = Array.isArray(layer.halo.material) ? layer.halo.material[0] : layer.halo.material;
        orangeHalo &&= halo instanceof THREE.MeshBasicMaterial
          && halo.color.getHex() === THERMAL_GHOST_ORANGE_HEX
          && halo.side === THREE.BackSide
          && layer.halo.scale.x === THERMAL_GHOST_HALO_SCALE;
      }
    }
    return Object.freeze({
      contract: THERMAL_GHOST_PRESENTATION_CONTRACT,
      trackedTargets: this.records.size,
      activeTargets: this.activeTargets,
      activeModelLayers: this.activeModelLayers,
      activeHaloLayers: this.activeHaloLayers,
      geometryIdentity,
      skeletonIdentity,
      throughGeometry,
      orangeHalo,
      proxyMeshes: 0,
      maxTargets: THERMAL_GHOST_MAX_TARGETS,
      exactModelMaterials: this.ownedExactMaterials.size,
      haloMaterials: this.haloMaterialDisposed ? 0 : 1,
      ownedMaterials: this.ownedExactMaterials.size + (this.haloMaterialDisposed ? 0 : 1),
      maxOwnedMaterials: THERMAL_GHOST_MAX_OWNED_MATERIALS,
      materialBudgetExceeded: this.materialBudgetExceeded,
      completeOperatorModels,
      incompleteTargets,
      maxBodyLayers: THERMAL_GHOST_MAX_BODY_LAYERS,
    });
  }

  terminalDispose(): void {
    this.clear();
    if (!this.haloMaterialDisposed) {
      this.sharedHaloMaterial.dispose();
      this.haloMaterialDisposed = true;
    }
  }
}
