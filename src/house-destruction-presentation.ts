import * as THREE from 'three';
import type { PresentationPrewarmRuntime } from './rendering/render-runtime';
import {
  HOUSE_POSITION_Q,
  HOUSE_ROTATION_Q,
  houseDestructionStateMatchesDefinitions,
  type HouseDestructionState,
  type HouseFragmentDefinition,
} from './house-destruction';

type MaterialId = HouseFragmentDefinition['presentationMaterialId'];

const MATERIAL_ORDER = Object.freeze([
  'aqua-wall',
  'coral-wall',
  'roof-shingles',
  'storage-locker',
] as const satisfies readonly MaterialId[]);

function createMaterial(id: MaterialId): THREE.MeshStandardMaterial {
  const material = id === 'aqua-wall'
    ? new THREE.MeshStandardMaterial({ color: 0x5a9b95, roughness: 0.76, metalness: 0.04 })
    : id === 'coral-wall'
      ? new THREE.MeshStandardMaterial({ color: 0xb56e5e, roughness: 0.76, metalness: 0.04 })
      : id === 'roof-shingles'
        ? new THREE.MeshStandardMaterial({ color: 0x4b5551, roughness: 0.88, metalness: 0.08 })
        : new THREE.MeshStandardMaterial({ color: 0x355b58, roughness: 0.48, metalness: 0.62 });
  material.name = `atomic-house-fragment-${id}-v1`;
  return material;
}

function bodyMatrix(
  definition: HouseFragmentDefinition,
  state: HouseDestructionState,
): THREE.Matrix4 {
  const body = state.majorDebris.find((candidate) => candidate.fragmentId === definition.id);
  const position = body
    ? new THREE.Vector3(
      body.poseQ.position.xQ / HOUSE_POSITION_Q,
      body.poseQ.position.yQ / HOUSE_POSITION_Q,
      body.poseQ.position.zQ / HOUSE_POSITION_Q,
    )
    : new THREE.Vector3(definition.position.x, definition.position.y, definition.position.z);
  const rotation = body
    ? new THREE.Quaternion(
      body.poseQ.rotation.xQ / HOUSE_ROTATION_Q,
      body.poseQ.rotation.yQ / HOUSE_ROTATION_Q,
      body.poseQ.rotation.zQ / HOUSE_ROTATION_Q,
      body.poseQ.rotation.wQ / HOUSE_ROTATION_Q,
    ).normalize()
    : new THREE.Quaternion(
      definition.rotation.x,
      definition.rotation.y,
      definition.rotation.z,
      definition.rotation.w,
    ).normalize();
  return new THREE.Matrix4().compose(
    position,
    rotation,
    new THREE.Vector3(definition.halfExtents.x, definition.halfExtents.y, definition.halfExtents.z),
  );
}

export type HouseDestructionPresentationTelemetry = Readonly<{
  fragments: number;
  detached: number;
  visibleInstances: number;
  activeDraws: number;
  externalProfileOwnsStaticFragments: boolean;
  prewarmed: boolean;
}>;

/**
 * Four bounded instanced draws cover every authored wall, roof and furniture
 * cuboid. Major fragments remain scene-level and visible in every quality
 * profile; only still-attached geometry already supplied by the Quality GLB
 * may be suppressed.
 */
export class HouseDestructionPresentation {
  readonly root = new THREE.Group();
  private readonly meshes = new Map<MaterialId, THREE.InstancedMesh>();
  private readonly geometry = new THREE.BoxGeometry(2, 2, 2);
  private state: HouseDestructionState;
  private externalProfileOwnsStaticFragments = false;
  private disposed = false;
  // HF-332: Per-group prewarm generation and promise for interactive-destruction / collapse-debris
  private gpuPrewarmGeneration: number | null = null;
  private gpuPrewarmPromise: Promise<void> | null = null;

  constructor(
    private readonly definitions: readonly HouseFragmentDefinition[],
    initialState: HouseDestructionState,
  ) {
    if (!houseDestructionStateMatchesDefinitions(initialState, definitions)) {
      throw new TypeError('House destruction presentation definition mismatch');
    }
    this.root.name = 'atomic-house-structural-fragments';
    this.root.userData.dynamic = true;
    this.root.userData.authorityClass = 'host-owned-preauthored-house-fragments';
    this.root.userData.qualityInvariantMajorFragments = true;
    this.root.userData.arbitraryRuntimeFracture = false;
    this.geometry.name = 'atomic-house-preauthored-cuboid-fragment-geometry';
    for (const materialId of MATERIAL_ORDER) {
      const entries = definitions.filter((definition) => definition.presentationMaterialId === materialId);
      if (entries.length === 0) continue;
      const mesh = new THREE.InstancedMesh(this.geometry, createMaterial(materialId), entries.length);
      mesh.name = `atomic-house-fragments:${materialId}`;
      mesh.userData.fragmentIds = entries.map((definition) => definition.id);
      mesh.userData.blocksShots = true;
      mesh.userData.qualityInvariantMajorFragments = true;
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.meshes.set(materialId, mesh);
      this.root.add(mesh);
    }
    this.state = initialState;
    this.sync(initialState);
  }

  sync(state: HouseDestructionState): void {
    if (!houseDestructionStateMatchesDefinitions(state, this.definitions)) {
      throw new TypeError('House destruction presentation state mismatch');
    }
    this.state = state;
    for (const materialId of MATERIAL_ORDER) {
      const mesh = this.meshes.get(materialId);
      if (!mesh) continue;
      const entries = this.definitions.filter((definition) => definition.presentationMaterialId === materialId);
      let visibleInstances = 0;
      entries.forEach((definition, index) => {
        const fragmentState = state.fragments.find((fragment) => fragment.fragmentId === definition.id)!;
        const externallyOwned = this.externalProfileOwnsStaticFragments
          && definition.profileOwnedPresentation
          && fragmentState.stage !== 'detached';
        if (externallyOwned) {
          mesh.setMatrixAt(index, new THREE.Matrix4().makeScale(0, 0, 0));
          return;
        }
        mesh.setMatrixAt(index, bodyMatrix(definition, state));
        visibleInstances += 1;
      });
      mesh.visible = visibleInstances > 0;
      mesh.userData.visibleInstances = visibleInstances;
      mesh.instanceMatrix.needsUpdate = true;
    }
    this.root.userData.worldRevision = state.revision;
  }

  setExternalProfileOwnsStaticFragments(active: boolean): void {
    if (this.externalProfileOwnsStaticFragments === active) return;
    this.externalProfileOwnsStaticFragments = active;
    this.sync(this.state);
  }

  raycastMeshes(): readonly THREE.InstancedMesh[] {
    return Object.freeze([...this.meshes.values()].filter((mesh) => mesh.visible));
  }

  // HF-332: Prewarms all presentation resources (wall, roof, furniture cuboids) for interactive destruction
  async prewarm(
    runtime: PresentationPrewarmRuntime,
    camera: THREE.Camera,
    sceneGeneration = 0,
  ): Promise<void> {
    if (this.gpuPrewarmGeneration === sceneGeneration) return;
    while (this.gpuPrewarmPromise) {
      const pending = this.gpuPrewarmPromise;
      try {
        await pending;
      } catch {
        if (this.gpuPrewarmPromise === pending) this.gpuPrewarmPromise = null;
      }
      if (this.gpuPrewarmGeneration === sceneGeneration) return;
    }
    const operation = this.performGpuPrewarm(runtime, camera, sceneGeneration);
    this.gpuPrewarmPromise = operation;
    try {
      await operation;
    } finally {
      if (this.gpuPrewarmPromise === operation) this.gpuPrewarmPromise = null;
    }
  }

  private async performGpuPrewarm(
    runtime: PresentationPrewarmRuntime,
    camera: THREE.Camera,
    sceneGeneration: number,
  ): Promise<void> {
    const parentScene = this.root.parent;
    if (!(parentScene instanceof THREE.Scene)) {
      throw new Error('House destruction presentation must be attached to a scene before prewarm');
    }
    for (const [, mesh] of this.meshes) {
      mesh.visible = true;
      if (mesh.count > 0 && mesh.userData.visibleInstances === 0) {
        mesh.setMatrixAt(0, new THREE.Matrix4().makeScale(1, 1, 1));
        mesh.instanceMatrix.needsUpdate = true;
      }
    }
    try {
      await runtime.compileAndRender(this.root, camera, parentScene);
      this.gpuPrewarmGeneration = sceneGeneration;
    } finally {
      this.sync(this.state);
    }
  }

  telemetry(): HouseDestructionPresentationTelemetry {
    const visibleInstances = [...this.meshes.values()]
      .reduce((sum, mesh) => sum + Number(mesh.userData.visibleInstances ?? 0), 0);
    return Object.freeze({
      fragments: this.definitions.length,
      detached: this.state.detachedFragmentIds.length,
      visibleInstances,
      activeDraws: [...this.meshes.values()].filter((mesh) => mesh.visible).length,
      externalProfileOwnsStaticFragments: this.externalProfileOwnsStaticFragments,
      prewarmed: this.gpuPrewarmGeneration !== null,
    });
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    const materials = new Set<THREE.Material>();
    this.meshes.forEach((mesh) => {
      const entries = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      entries.forEach((material) => materials.add(material));
    });
    materials.forEach((material) => material.dispose());
    this.geometry.dispose();
    this.root.removeFromParent();
    this.root.clear();
  }
}
