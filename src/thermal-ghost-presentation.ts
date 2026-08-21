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
  activeTargetIds: readonly string[];
  activeModelLayers: number;
  activeHaloLayers: number;
  activeSourceBodyLayers?: number;
  activeNormalMaterialSlots?: number;
  geometryIdentity: boolean;
  skeletonIdentity: boolean;
  bindMatrixIdentity?: boolean;
  meshWorldMatrixIdentity?: boolean;
  haloWorldMatrixIdentity?: boolean;
  boneWorldMatrixIdentity?: boolean;
  normalMaterialEquivalence?: boolean;
  silhouetteLayerIdentity?: boolean;
  siblingParentIdentity?: boolean;
  evidenceControlHidden: boolean;
  exactModelVisible: boolean;
  exactModelColorWrite: boolean;
  exactModelOpacity: number;
  exactModelDepthTestDisabled: boolean;
  exactModelDepthWriteDisabled: boolean;
  haloVisible: boolean;
  haloColorWrite: boolean;
  haloOpacity: number;
  haloDepthTestDisabled: boolean;
  haloDepthWriteDisabled: boolean;
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
  active: boolean;
};

type ExactMaterialLease = {
  material: THREE.Material;
  references: number;
  lastSyncedGeneration: number;
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
  return sourceMaterials(source).some((material) => (
    material.visible && material.colorWrite && material.opacity > 0
  ));
}

const MATERIAL_PROGRAM_VALUE_KEYS = Object.freeze([
  'alphaHash', 'alphaToCoverage', 'blending', 'colorWrite', 'dithering', 'flatShading',
  'fog', 'forceSinglePass', 'premultipliedAlpha', 'precision', 'shadowSide', 'side',
  'toneMapped', 'transparent', 'vertexColors', 'visible', 'wireframe',
] as const);

const MATERIAL_UNIFORM_VALUE_KEYS = Object.freeze([
  'alphaTest', 'blendAlpha', 'blendDst', 'blendDstAlpha', 'blendEquation',
  'blendEquationAlpha', 'blendSrc', 'blendSrcAlpha', 'clipIntersection', 'clipShadows',
  'opacity', 'polygonOffset', 'polygonOffsetFactor', 'polygonOffsetUnits',
  'stencilFail', 'stencilFunc', 'stencilFuncMask', 'stencilRef', 'stencilWrite',
  'stencilWriteMask', 'stencilZFail', 'stencilZPass',
] as const);

const STANDARD_PROGRAM_VALUE_KEYS = Object.freeze([
  'normalMapType', 'wireframeLinecap', 'wireframeLinejoin',
] as const);

const STANDARD_UNIFORM_VALUE_KEYS = Object.freeze([
  'aoMapIntensity', 'bumpScale', 'displacementBias', 'displacementScale',
  'emissiveIntensity', 'envMapIntensity', 'lightMapIntensity', 'metalness',
  'roughness', 'wireframeLinewidth',
] as const);

const STANDARD_TEXTURE_KEYS = Object.freeze([
  'alphaMap', 'aoMap', 'bumpMap', 'displacementMap', 'emissiveMap', 'envMap',
  'lightMap', 'map', 'metalnessMap', 'normalMap', 'roughnessMap',
] as const);

const BASIC_PROGRAM_VALUE_KEYS = Object.freeze([
  'combine', 'wireframeLinecap', 'wireframeLinejoin',
] as const);

const BASIC_UNIFORM_VALUE_KEYS = Object.freeze([
  'aoMapIntensity', 'lightMapIntensity', 'reflectivity', 'refractionRatio',
  'wireframeLinewidth',
] as const);

const BASIC_TEXTURE_KEYS = Object.freeze([
  'alphaMap', 'aoMap', 'envMap', 'lightMap', 'map', 'specularMap',
] as const);

type AppearanceMaterial = THREE.Material & Record<string, unknown>;
type MutableThermalGhostTelemetry = {
  -readonly [Key in keyof Required<ThermalGhostTelemetry>]: Required<ThermalGhostTelemetry>[Key];
};

function appearance(material: THREE.Material): AppearanceMaterial {
  return material as unknown as AppearanceMaterial;
}

function syncMaterialValues(
  source: AppearanceMaterial,
  target: AppearanceMaterial,
  keys: readonly string[],
): boolean {
  let changed = false;
  for (const key of keys) {
    if (target[key] === source[key]) continue;
    target[key] = source[key];
    changed = true;
  }
  return changed;
}

function materialValuesEqual(
  source: AppearanceMaterial,
  target: AppearanceMaterial,
  keys: readonly string[],
): boolean {
  return keys.every((key) => target[key] === source[key]);
}

/**
 * Mirrors the source's live appearance without cloning or allocating textures.
 * Program-changing fields only invalidate the clone when their value actually
 * changes; animated colors, opacity and PBR uniforms do not churn pipelines.
 */
function syncExactMaterialAppearance(source: THREE.Material, target: THREE.Material): boolean {
  if (source.type !== target.type) return false;
  const sourceAppearance = appearance(source);
  const targetAppearance = appearance(target);
  let programChanged = syncMaterialValues(sourceAppearance, targetAppearance, MATERIAL_PROGRAM_VALUE_KEYS);
  syncMaterialValues(sourceAppearance, targetAppearance, MATERIAL_UNIFORM_VALUE_KEYS);
  target.blendColor.copy(source.blendColor);

  if (source instanceof THREE.MeshStandardMaterial && target instanceof THREE.MeshStandardMaterial) {
    const programValuesChanged = syncMaterialValues(sourceAppearance, targetAppearance, STANDARD_PROGRAM_VALUE_KEYS);
    const texturesChanged = syncMaterialValues(sourceAppearance, targetAppearance, STANDARD_TEXTURE_KEYS);
    programChanged ||= programValuesChanged || texturesChanged;
    syncMaterialValues(sourceAppearance, targetAppearance, STANDARD_UNIFORM_VALUE_KEYS);
    target.color.copy(source.color);
    target.emissive.copy(source.emissive);
    target.normalScale.copy(source.normalScale);
    target.envMapRotation.copy(source.envMapRotation);
  } else if (source instanceof THREE.MeshBasicMaterial && target instanceof THREE.MeshBasicMaterial) {
    const programValuesChanged = syncMaterialValues(sourceAppearance, targetAppearance, BASIC_PROGRAM_VALUE_KEYS);
    const texturesChanged = syncMaterialValues(sourceAppearance, targetAppearance, BASIC_TEXTURE_KEYS);
    programChanged ||= programValuesChanged || texturesChanged;
    syncMaterialValues(sourceAppearance, targetAppearance, BASIC_UNIFORM_VALUE_KEYS);
    target.color.copy(source.color);
  } else {
    return false;
  }

  // These are the only intentional differences from the normal model.
  target.depthTest = false;
  target.depthWrite = false;
  programChanged ||= target.clippingPlanes !== null;
  target.clippingPlanes = null;
  if (programChanged) target.needsUpdate = true;
  return true;
}

function exactMaterialAppearanceEquivalent(source: THREE.Material, target: THREE.Material): boolean {
  const sourceAppearance = appearance(source);
  const targetAppearance = appearance(target);
  if (source.type !== target.type
    || !materialValuesEqual(sourceAppearance, targetAppearance, MATERIAL_PROGRAM_VALUE_KEYS)
    || !materialValuesEqual(sourceAppearance, targetAppearance, MATERIAL_UNIFORM_VALUE_KEYS)
    || !target.blendColor.equals(source.blendColor)) return false;

  if (source instanceof THREE.MeshStandardMaterial && target instanceof THREE.MeshStandardMaterial) {
    return materialValuesEqual(sourceAppearance, targetAppearance, STANDARD_PROGRAM_VALUE_KEYS)
      && materialValuesEqual(sourceAppearance, targetAppearance, STANDARD_UNIFORM_VALUE_KEYS)
      && materialValuesEqual(sourceAppearance, targetAppearance, STANDARD_TEXTURE_KEYS)
      && target.color.equals(source.color)
      && target.emissive.equals(source.emissive)
      && target.normalScale.equals(source.normalScale)
      && target.envMapRotation.equals(source.envMapRotation);
  }
  if (source instanceof THREE.MeshBasicMaterial && target instanceof THREE.MeshBasicMaterial) {
    return materialValuesEqual(sourceAppearance, targetAppearance, BASIC_PROGRAM_VALUE_KEYS)
      && materialValuesEqual(sourceAppearance, targetAppearance, BASIC_UNIFORM_VALUE_KEYS)
      && materialValuesEqual(sourceAppearance, targetAppearance, BASIC_TEXTURE_KEYS)
      && target.color.equals(source.color);
  }
  return false;
}

function matrixEquals(left: THREE.Matrix4, right: THREE.Matrix4, tolerance = 1e-9): boolean {
  for (let index = 0; index < 16; index += 1) {
    if (Math.abs(left.elements[index]! - right.elements[index]!) > tolerance) return false;
  }
  return true;
}

const HALO_SCALE_VECTOR = new THREE.Vector3(
  THERMAL_GHOST_HALO_SCALE,
  THERMAL_GHOST_HALO_SCALE,
  THERMAL_GHOST_HALO_SCALE,
);

function exactMeshMaterialsEquivalent(layer: GhostLayer): boolean {
  if (Array.isArray(layer.model.material)) {
    if (layer.model.material.length !== layer.sourceMaterials.length) return false;
    for (let index = 0; index < layer.model.material.length; index += 1) {
      if (!exactMaterialAppearanceEquivalent(layer.sourceMaterials[index]!, layer.model.material[index]!)) return false;
    }
    return true;
  }
  return layer.sourceMaterials.length === 1
    && exactMaterialAppearanceEquivalent(layer.sourceMaterials[0]!, layer.model.material);
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
 * Thermal layers are siblings of the source mesh. Parenting them to the
 * SkinnedMesh applied its local transform twice to bind-space vertices and
 * moved the reveal away from the real operator behind the wall.
 */
function syncSiblingTransforms(layer: GhostLayer): void {
  const { source, model, halo } = layer;
  if (source.matrixAutoUpdate) source.updateMatrix();
  model.matrix.copy(source.matrix);
  halo.matrix.copy(source.matrix).scale(HALO_SCALE_VECTOR);
  model.matrixWorldNeedsUpdate = true;
  halo.matrixWorldNeedsUpdate = true;
  if (source.morphTargetInfluences) {
    model.morphTargetInfluences = source.morphTargetInfluences;
    halo.morphTargetInfluences = source.morphTargetInfluences;
  }
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
  private readonly expectedHaloWorldMatrix = new THREE.Matrix4();
  private readonly telemetryState: MutableThermalGhostTelemetry = {
    contract: THERMAL_GHOST_PRESENTATION_CONTRACT,
    trackedTargets: 0,
    activeTargets: 0,
    activeTargetIds: [],
    activeModelLayers: 0,
    activeHaloLayers: 0,
    activeSourceBodyLayers: 0,
    activeNormalMaterialSlots: 0,
    geometryIdentity: true,
    skeletonIdentity: true,
    bindMatrixIdentity: true,
    meshWorldMatrixIdentity: true,
    haloWorldMatrixIdentity: true,
    boneWorldMatrixIdentity: true,
    normalMaterialEquivalence: true,
    silhouetteLayerIdentity: true,
    siblingParentIdentity: true,
    evidenceControlHidden: false,
    exactModelVisible: false,
    exactModelColorWrite: false,
    exactModelOpacity: 0,
    exactModelDepthTestDisabled: false,
    exactModelDepthWriteDisabled: false,
    haloVisible: false,
    haloColorWrite: false,
    haloOpacity: 0,
    haloDepthTestDisabled: false,
    haloDepthWriteDisabled: false,
    throughGeometry: false,
    orangeHalo: false,
    proxyMeshes: 0,
    maxTargets: THERMAL_GHOST_MAX_TARGETS,
    exactModelMaterials: 0,
    haloMaterials: 1,
    ownedMaterials: 1,
    maxOwnedMaterials: THERMAL_GHOST_MAX_OWNED_MATERIALS,
    materialBudgetExceeded: false,
    completeOperatorModels: true,
    incompleteTargets: 0,
    maxBodyLayers: THERMAL_GHOST_MAX_BODY_LAYERS,
  };
  private generation = 0;
  private activeTargets = 0;
  private readonly activeTargetIds: string[] = [];
  private activeModelLayers = 0;
  private activeHaloLayers = 0;
  private activeSourceBodyLayers = 0;
  private activeNormalMaterialSlots = 0;
  private materialBudgetExceeded = false;
  private haloMaterialDisposed = false;
  private evidenceControlHidden = false;

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
        syncExactMaterialAppearance(material, clone);
        lease = { material: clone, references: 0, lastSyncedGeneration: this.generation };
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
    const namedOperatorVisual = target.root.getObjectByName('rigged-operator-visual');
    const operatorVisual = namedOperatorVisual ?? target.root;
    const candidateMeshes: THREE.Mesh[] = [];
    const skinnedBodyMeshes: THREE.SkinnedMesh[] = [];
    let unsupportedInstancedBody = false;
    operatorVisual.traverse((node) => {
      if (node.userData.thermalGhost === true) return;
      if (!(node instanceof THREE.Mesh)) return;
      if (node instanceof THREE.InstancedMesh) {
        unsupportedInstancedBody = true;
        return;
      }
      candidateMeshes.push(node);
      if (node instanceof THREE.SkinnedMesh) skinnedBodyMeshes.push(node);
    });
    // The shipped rig owns exactly nine skinned body primitives. Static meshes
    // can be attached below the named visual at runtime (weapon/gear effects),
    // but they are not part of the animated operator corpus and previously
    // pushed every real actor above the 12-layer fail-closed bound. Procedural
    // fixtures and fallback actors without a skinned visual retain all meshes.
    const sourceBodyMeshes: THREE.Mesh[] = namedOperatorVisual && skinnedBodyMeshes.length > 0
      ? skinnedBodyMeshes
      : candidateMeshes;
    if (namedOperatorVisual && skinnedBodyMeshes.length > 0) unsupportedInstancedBody = false;
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
      const parent = node.parent;
      if (!parent) continue;
      const sourceLayerMaterials = sourceMaterials(node);
      const modelMaterials = this.acquireExactModelMaterials(node);
      // The complete-record preflight above makes this unreachable unless a
      // caller mutates the material graph during synchronous construction.
      if (!modelMaterials) break;
      const model = presentationMesh(node, Array.isArray(node.material) ? modelMaterials : modelMaterials[0]);
      const halo = presentationMesh(node, this.sharedHaloMaterial);
      this.prepareLayer(model, 'through-wall-exact-operator-model', 998);
      this.prepareLayer(halo, 'through-wall-operator-orange-halo', 999);
      const layer = { source: node, model, halo, sourceMaterials: sourceLayerMaterials, active: false };
      syncSiblingTransforms(layer);
      parent.add(model, halo);
      layers.push(layer);
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

  private prepareLayer(mesh: THREE.Mesh, name: string, renderOrder: number): void {
    mesh.name = name;
    mesh.userData.thermalGhost = true;
    mesh.userData.presentationOnly = true;
    mesh.userData.authority = 'none';
    mesh.userData.attachment = 'source-sibling';
    mesh.matrixAutoUpdate = false;
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
    this.activeTargetIds.length = 0;
    this.activeModelLayers = 0;
    this.activeHaloLayers = 0;
    this.activeSourceBodyLayers = 0;
    this.activeNormalMaterialSlots = 0;
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
          layer.active = false;
          syncSiblingTransforms(layer);
          for (const sourceMaterial of layer.sourceMaterials) {
            const lease = this.exactMaterialCache.get(sourceMaterial);
            if (!lease || lease.lastSyncedGeneration === this.generation) continue;
            syncExactMaterialAppearance(sourceMaterial, lease.material);
            lease.lastSyncedGeneration = this.generation;
          }
          if (this.evidenceControlHidden) {
            for (const sourceMaterial of layer.sourceMaterials) {
              const lease = this.exactMaterialCache.get(sourceMaterial);
              if (lease) lease.material.visible = false;
            }
          }
          // A child-visible flag alone false-greens hidden LODs and materials.
          // Mirror the renderer's effective source visibility to the admitted
          // root and require at least one color-writing material.
          const visible = effectivelyVisible(layer.source, record.sourceRoot)
            && hasRenderableSourceMaterial(layer.source);
          layer.model.visible = visible;
          layer.halo.visible = visible;
          if (!visible) continue;
          layer.active = true;
          visibleLayers += 1;
          this.activeSourceBodyLayers += 1;
          this.activeNormalMaterialSlots += layer.sourceMaterials.length;
          this.activeModelLayers += 1;
          this.activeHaloLayers += 1;
        }
        if (visibleLayers > 0) {
          this.activeTargets += 1;
          this.activeTargetIds.push(target.id);
        }
      }
    }
    for (const [id, record] of this.records) {
      if (record.lastSeenGeneration === this.generation && active) continue;
      for (const layer of record.layers) {
        layer.active = false;
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
    this.setEvidenceControlHidden(false);
    for (const record of this.records.values()) this.releaseRecord(record);
    this.records.clear();
    this.activeTargets = 0;
    this.activeTargetIds.length = 0;
    this.activeModelLayers = 0;
    this.activeHaloLayers = 0;
    this.activeSourceBodyLayers = 0;
    this.activeNormalMaterialSlots = 0;
    this.materialBudgetExceeded = false;
  }

  /** Presentation-only paired-raster control; gameplay target state is untouched. */
  setEvidenceControlHidden(hidden: boolean): boolean {
    this.evidenceControlHidden = hidden;
    this.sharedHaloMaterial.visible = !hidden;
    for (const material of this.ownedExactMaterials) material.visible = !hidden;
    return this.evidenceControlHidden === hidden;
  }

  telemetry(): ThermalGhostTelemetry {
    let geometryIdentity = true;
    let skeletonIdentity = true;
    let bindMatrixIdentity = true;
    let meshWorldMatrixIdentity = true;
    let haloWorldMatrixIdentity = true;
    let boneWorldMatrixIdentity = true;
    let siblingParentIdentity = true;
    let normalMaterialEquivalence = true;
    let exactModelVisible = this.activeModelLayers > 0;
    let exactModelColorWrite = this.activeModelLayers > 0;
    let exactModelOpacity = this.activeModelLayers > 0 ? Number.POSITIVE_INFINITY : 0;
    let exactModelDepthTestDisabled = this.activeModelLayers > 0;
    let exactModelDepthWriteDisabled = this.activeModelLayers > 0;
    let haloVisible = this.activeHaloLayers > 0;
    let haloColorWrite = this.activeHaloLayers > 0;
    let haloOpacity = this.activeHaloLayers > 0 ? Number.POSITIVE_INFINITY : 0;
    let haloDepthTestDisabled = this.activeHaloLayers > 0;
    let haloDepthWriteDisabled = this.activeHaloLayers > 0;
    let haloColorAndSide = this.activeHaloLayers > 0;
    let completeOperatorModels = true;
    let incompleteTargets = 0;
    for (const record of this.records.values()) {
      completeOperatorModels &&= record.complete;
      if (!record.complete) incompleteTargets += 1;
      for (const layer of record.layers) {
        layer.source.updateWorldMatrix(true, false);
        layer.model.updateWorldMatrix(true, false);
        layer.halo.updateWorldMatrix(true, false);
        siblingParentIdentity &&= layer.model.parent === layer.source.parent
          && layer.halo.parent === layer.source.parent;
        meshWorldMatrixIdentity &&= matrixEquals(layer.source.matrixWorld, layer.model.matrixWorld);
        this.expectedHaloWorldMatrix.copy(layer.source.matrixWorld).scale(HALO_SCALE_VECTOR);
        haloWorldMatrixIdentity &&= matrixEquals(this.expectedHaloWorldMatrix, layer.halo.matrixWorld);
        geometryIdentity &&= layer.model.geometry === layer.source.geometry
          && layer.halo.geometry === layer.source.geometry;
        if (layer.source instanceof THREE.SkinnedMesh) {
          const model = layer.model instanceof THREE.SkinnedMesh ? layer.model : null;
          const haloModel = layer.halo instanceof THREE.SkinnedMesh ? layer.halo : null;
          skeletonIdentity &&= model !== null
            && haloModel !== null
            && model.skeleton === layer.source.skeleton
            && haloModel.skeleton === layer.source.skeleton;
          bindMatrixIdentity &&= model !== null
            && haloModel !== null
            && matrixEquals(model.bindMatrix, layer.source.bindMatrix)
            && matrixEquals(haloModel.bindMatrix, layer.source.bindMatrix)
            && model.bindMode === layer.source.bindMode
            && haloModel.bindMode === layer.source.bindMode;
          boneWorldMatrixIdentity &&= model !== null && sharedBoneWorldMatricesMatch(layer.source, model);
        }
        normalMaterialEquivalence &&= exactMeshMaterialsEquivalent(layer);
        if (!layer.active) continue;
        const modelMaterials = Array.isArray(layer.model.material) ? layer.model.material : [layer.model.material];
        exactModelVisible &&= layer.model.visible && modelMaterials.every((material) => material.visible);
        exactModelColorWrite &&= modelMaterials.every((material) => material.colorWrite);
        exactModelOpacity = Math.min(exactModelOpacity, ...modelMaterials.map((material) => material.opacity));
        exactModelDepthTestDisabled &&= modelMaterials.every((material) => !material.depthTest);
        exactModelDepthWriteDisabled &&= modelMaterials.every((material) => !material.depthWrite);
        const haloMaterials = Array.isArray(layer.halo.material) ? layer.halo.material : [layer.halo.material];
        haloVisible &&= layer.halo.visible && haloMaterials.every((material) => material.visible);
        haloColorWrite &&= haloMaterials.every((material) => material.colorWrite);
        haloOpacity = Math.min(haloOpacity, ...haloMaterials.map((material) => material.opacity));
        haloDepthTestDisabled &&= haloMaterials.every((material) => !material.depthTest);
        haloDepthWriteDisabled &&= haloMaterials.every((material) => !material.depthWrite);
        const halo = Array.isArray(layer.halo.material) ? layer.halo.material[0] : layer.halo.material;
        haloColorAndSide &&= halo instanceof THREE.MeshBasicMaterial
          && halo.color.getHex() === THERMAL_GHOST_ORANGE_HEX
          && halo.side === THREE.BackSide;
      }
    }
    const state = this.telemetryState;
    state.trackedTargets = this.records.size;
    state.activeTargets = this.activeTargets;
    state.activeTargetIds = Object.freeze([...this.activeTargetIds]);
    state.activeModelLayers = this.activeModelLayers;
    state.activeHaloLayers = this.activeHaloLayers;
    state.activeSourceBodyLayers = this.activeSourceBodyLayers;
    state.activeNormalMaterialSlots = this.activeNormalMaterialSlots;
    state.geometryIdentity = geometryIdentity;
    state.skeletonIdentity = skeletonIdentity;
    state.bindMatrixIdentity = bindMatrixIdentity;
    state.meshWorldMatrixIdentity = meshWorldMatrixIdentity;
    state.haloWorldMatrixIdentity = haloWorldMatrixIdentity;
    state.boneWorldMatrixIdentity = boneWorldMatrixIdentity;
    state.normalMaterialEquivalence = normalMaterialEquivalence;
    state.silhouetteLayerIdentity = this.activeSourceBodyLayers === this.activeModelLayers
      && this.activeSourceBodyLayers === this.activeHaloLayers;
    state.siblingParentIdentity = siblingParentIdentity;
    state.evidenceControlHidden = this.evidenceControlHidden;
    state.exactModelVisible = exactModelVisible;
    state.exactModelColorWrite = exactModelColorWrite;
    state.exactModelOpacity = Number.isFinite(exactModelOpacity) ? exactModelOpacity : 0;
    state.exactModelDepthTestDisabled = exactModelDepthTestDisabled;
    state.exactModelDepthWriteDisabled = exactModelDepthWriteDisabled;
    state.haloVisible = haloVisible;
    state.haloColorWrite = haloColorWrite;
    state.haloOpacity = Number.isFinite(haloOpacity) ? haloOpacity : 0;
    state.haloDepthTestDisabled = haloDepthTestDisabled;
    state.haloDepthWriteDisabled = haloDepthWriteDisabled;
    state.throughGeometry = exactModelVisible
      && exactModelColorWrite
      && state.exactModelOpacity > 0
      && exactModelDepthTestDisabled
      && exactModelDepthWriteDisabled
      && haloVisible
      && haloColorWrite
      && state.haloOpacity > 0
      && haloDepthTestDisabled
      && haloDepthWriteDisabled;
    state.orangeHalo = state.throughGeometry && haloColorAndSide;
    state.exactModelMaterials = this.ownedExactMaterials.size;
    state.haloMaterials = this.haloMaterialDisposed ? 0 : 1;
    state.ownedMaterials = this.ownedExactMaterials.size + (this.haloMaterialDisposed ? 0 : 1);
    state.materialBudgetExceeded = this.materialBudgetExceeded;
    state.completeOperatorModels = completeOperatorModels;
    state.incompleteTargets = incompleteTargets;
    return state;
  }

  terminalDispose(): void {
    this.clear();
    if (!this.haloMaterialDisposed) {
      this.sharedHaloMaterial.dispose();
      this.haloMaterialDisposed = true;
    }
  }
}
