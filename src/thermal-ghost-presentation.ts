import * as THREE from 'three';

export type ThermalGhostRelation = 'friendly' | 'hostile';

export type ThermalGhostTarget = Readonly<{
  id: string;
  relation: ThermalGhostRelation;
  root: THREE.Object3D;
}>;

export const THERMAL_GHOST_HOSTILE_HEX = 0xff9147;
export const THERMAL_GHOST_FRIENDLY_HEX = 0x63ecff;
export const THERMAL_GHOST_MAX_TARGETS = 16;

function ghostMaterial(name: string, colorHex: number): THREE.MeshBasicMaterial {
  // Normal (not additive) blending: additive washed the tint out against bright
  // arena backgrounds and read as nothing. A solid, depth-ignoring fill draws
  // the combatant's exact body outline on top of walls, which is the reveal the
  // owner asked for.
  return new THREE.MeshBasicMaterial({
    name,
    color: colorHex,
    transparent: true,
    opacity: 0.9,
    depthTest: false,
    depthWrite: false,
    blending: THREE.NormalBlending,
    toneMapped: false,
    side: THREE.FrontSide,
  });
}

type GhostRecord = {
  targetId: string;
  relation: ThermalGhostRelation;
  ghosts: THREE.Mesh[];
  sourceRoot: THREE.Object3D;
  lastSeenGeneration: number;
};

/**
 * Through-wall thermal reveal that re-renders each revealed combatant's OWN
 * meshes with a depth-ignoring thermal tint, instead of drawing a generic
 * silhouette sprite. Skinned ghosts share the source skeleton, bind matrix and
 * geometry, so the outline is the exact live pose of the bot or player.
 *
 * Presentation-only: ghosts never raycast, never own gameplay state, and both
 * relations share one material each so WebGPU compiles exactly two pipelines
 * per mesh class.
 */
export class ThermalGhostPresentation {
  private readonly hostileMaterial = ghostMaterial('thermal-ghost-hostile', THERMAL_GHOST_HOSTILE_HEX);
  private readonly friendlyMaterial = ghostMaterial('thermal-ghost-friendly', THERMAL_GHOST_FRIENDLY_HEX);
  private readonly records = new Map<string, GhostRecord>();
  private generation = 0;
  private activeGhosts = 0;

  private materialFor(relation: ThermalGhostRelation): THREE.MeshBasicMaterial {
    return relation === 'hostile' ? this.hostileMaterial : this.friendlyMaterial;
  }

  private buildGhosts(target: ThermalGhostTarget): GhostRecord {
    const ghosts: THREE.Mesh[] = [];
    const material = this.materialFor(target.relation);
    target.root.updateWorldMatrix(true, false);
    target.root.traverse((node) => {
      if (node.userData.thermalGhost === true || node.userData.presentationOnly === true) return;
      if (node instanceof THREE.Sprite || ghosts.length >= 24) return;
      if (node instanceof THREE.SkinnedMesh) {
        const ghost = new THREE.SkinnedMesh(node.geometry, material);
        ghost.bind(node.skeleton, node.bindMatrix);
        this.prepareGhost(ghost);
        node.add(ghost);
        ghosts.push(ghost);
        return;
      }
      if (node instanceof THREE.Mesh && !(node instanceof THREE.InstancedMesh)) {
        const ghost = new THREE.Mesh(node.geometry, material);
        this.prepareGhost(ghost);
        node.add(ghost);
        ghosts.push(ghost);
      }
    });
    return {
      targetId: target.id,
      relation: target.relation,
      ghosts,
      sourceRoot: target.root,
      lastSeenGeneration: this.generation,
    };
  }

  private prepareGhost(ghost: THREE.Mesh): void {
    ghost.name = 'thermal-ghost';
    ghost.userData.thermalGhost = true;
    ghost.userData.presentationOnly = true;
    ghost.matrixAutoUpdate = false;
    ghost.matrix.identity();
    ghost.frustumCulled = false;
    ghost.renderOrder = 999;
    ghost.castShadow = false;
    ghost.receiveShadow = false;
    ghost.raycast = () => undefined;
  }

  private releaseRecord(record: GhostRecord): void {
    for (const ghost of record.ghosts) ghost.removeFromParent();
    record.ghosts.length = 0;
  }

  /** Show ghosts for exactly the given targets; hide everything else. */
  sync(targets: readonly ThermalGhostTarget[], active: boolean): void {
    this.generation += 1;
    this.activeGhosts = 0;
    if (active) {
      for (const target of targets.slice(0, THERMAL_GHOST_MAX_TARGETS)) {
        let record = this.records.get(target.id);
        if (record && (record.sourceRoot !== target.root || record.relation !== target.relation)) {
          this.releaseRecord(record);
          this.records.delete(target.id);
          record = undefined;
        }
        if (!record) {
          record = this.buildGhosts(target);
          this.records.set(target.id, record);
        }
        record.lastSeenGeneration = this.generation;
        for (const ghost of record.ghosts) {
          ghost.visible = true;
          this.activeGhosts += 1;
        }
      }
    }
    for (const [id, record] of this.records) {
      if (record.lastSeenGeneration === this.generation && active) continue;
      for (const ghost of record.ghosts) ghost.visible = false;
      // Sources despawn (death/teardown); drop records whose roots left the scene.
      if (!record.sourceRoot.parent) {
        this.releaseRecord(record);
        this.records.delete(id);
      }
    }
  }

  clear(): void {
    for (const record of this.records.values()) this.releaseRecord(record);
    this.records.clear();
    this.activeGhosts = 0;
  }

  telemetry(): Readonly<{ trackedTargets: number; activeGhosts: number; maxTargets: number }> {
    return Object.freeze({
      trackedTargets: this.records.size,
      activeGhosts: this.activeGhosts,
      maxTargets: THERMAL_GHOST_MAX_TARGETS,
    });
  }

  /** Terminal renderer teardown only. */
  terminalDispose(): void {
    this.clear();
    this.hostileMaterial.dispose();
    this.friendlyMaterial.dispose();
  }
}
