import * as THREE from 'three';
import type { ArenaId } from '../map-selection';
import type { RenderInfoSnapshot } from './render-runtime';

export type ArenaRenderLivenessAudit = Readonly<{
  arenaId: ArenaId;
  presentationRootName: string;
  eligible: boolean;
  rootAttached: boolean;
  rootVisible: boolean;
  definitionMatches: boolean;
  activeDefinitionRoots: number;
  renderableDescendants: number;
  visibleRenderableDescendants: number;
  cameraLayerRenderableDescendants: number;
  submissionExpected: boolean;
  calls: number;
  triangles: number;
  reasons: readonly string[];
}>;

export type ArenaRenderWatchdogTelemetry = Readonly<{
  status: 'warming' | 'healthy' | 'suspect' | 'failed' | 'not-applicable';
  consecutiveInvalidFrames: number;
  incidents: number;
  recoveries: number;
  recoveryActions: number;
  lastRecoveryReason: string | null;
  lastHealthyAt: number | null;
  lastAudit: ArenaRenderLivenessAudit | null;
  fatal: boolean;
  fatalReasons: readonly string[];
  lastFatalAt: number | null;
}>;

function renderable(node: THREE.Object3D): node is THREE.Mesh | THREE.Line | THREE.Points | THREE.Sprite {
  return node instanceof THREE.Mesh || node instanceof THREE.Line || node instanceof THREE.Points || node instanceof THREE.Sprite;
}

function materialVisible(node: THREE.Mesh | THREE.Line | THREE.Points | THREE.Sprite): boolean {
  const materials = Array.isArray(node.material) ? node.material : [node.material];
  return materials.some((material) => material.visible && material.opacity > 0);
}

function visibleThroughRoot(node: THREE.Object3D, root: THREE.Object3D): boolean {
  let cursor: THREE.Object3D | null = node;
  while (cursor) {
    if (!cursor.visible) return false;
    if (cursor === root) return true;
    cursor = cursor.parent;
  }
  return false;
}

/**
 * Audits only the selected authoritative arena root. Atmosphere, the viewmodel
 * and DOM HUD cannot satisfy this invariant, so a detached/hidden world cannot
 * masquerade as a healthy frame with a working sky and FPS counter.
 */
export function auditArenaRenderLiveness(
  scene: THREE.Scene,
  root: THREE.Group,
  arenaId: ArenaId,
  renderInfo: RenderInfoSnapshot,
  eligible = true,
  camera?: THREE.Camera,
  presentationRoot: THREE.Group = root,
  submissionExpected = true,
): ArenaRenderLivenessAudit {
  let renderableDescendants = 0;
  let visibleRenderableDescendants = 0;
  let cameraLayerRenderableDescendants = 0;
  presentationRoot.traverse((node) => {
    if (!renderable(node) || !materialVisible(node)) return;
    if (node instanceof THREE.InstancedMesh && node.count <= 0) return;
    renderableDescendants += 1;
    if (visibleThroughRoot(node, presentationRoot)) {
      visibleRenderableDescendants += 1;
      if (!camera || camera.layers.test(node.layers)) cameraLayerRenderableDescendants += 1;
    }
  });
  const rootAttached = presentationRoot.parent === scene;
  const rootVisible = presentationRoot.visible;
  const definitionMatches = root.userData.arenaVisualDefinitionId === arenaId
    && root.userData.authoritativeArenaId === arenaId;
  const activeDefinitionRoots = scene.children.filter((node) => node.userData.arenaVisualDefinitionId !== undefined).length;
  const reasons: string[] = [];
  if (eligible) {
    if (!rootAttached) reasons.push('selected-root-detached');
    if (!rootVisible) reasons.push('selected-root-hidden');
    if (!definitionMatches) reasons.push('selected-definition-mismatch');
    if (activeDefinitionRoots !== 1) reasons.push('definition-root-count');
    if (visibleRenderableDescendants === 0) reasons.push('selected-world-empty');
    else if (cameraLayerRenderableDescendants === 0) reasons.push('selected-world-out-of-camera-layer');
    if (submissionExpected && renderInfo.calls === 0) reasons.push('renderer-submission-empty');
  }
  return {
    arenaId,
    presentationRootName: presentationRoot.name,
    eligible,
    rootAttached,
    rootVisible,
    definitionMatches,
    activeDefinitionRoots,
    renderableDescendants,
    visibleRenderableDescendants,
    cameraLayerRenderableDescendants,
    submissionExpected,
    calls: renderInfo.calls,
    triangles: renderInfo.triangles,
    reasons,
  };
}

/** Debounced monitor: one transient WebGPU warm-up frame cannot trip a fault. */
export class ArenaRenderWatchdog {
  private consecutiveInvalidFrames = 0;
  private incidents = 0;
  private recoveries = 0;
  private recoveryActions = 0;
  private lastRecoveryReason: string | null = null;
  private lastHealthyAt: number | null = null;
  private lastAudit: ArenaRenderLivenessAudit | null = null;
  private lastFatalAt: number | null = null;
  private status: ArenaRenderWatchdogTelemetry['status'] = 'warming';

  constructor(private readonly failureThreshold = 3) {}

  observe(audit: ArenaRenderLivenessAudit, now: number): ArenaRenderWatchdogTelemetry {
    this.lastAudit = audit;
    if (!audit.eligible) {
      this.consecutiveInvalidFrames = 0;
      this.status = 'not-applicable';
      return this.telemetry();
    }
    if (audit.reasons.length === 0) {
      if (this.status === 'failed' || this.status === 'suspect') this.recoveries += 1;
      this.consecutiveInvalidFrames = 0;
      this.lastHealthyAt = now;
      this.status = 'healthy';
      return this.telemetry();
    }
    this.consecutiveInvalidFrames += 1;
    if (this.consecutiveInvalidFrames >= this.failureThreshold) {
      if (this.status !== 'failed') {
        this.incidents += 1;
        this.lastFatalAt = now;
      }
      this.status = 'failed';
    } else {
      this.status = 'suspect';
    }
    return this.telemetry();
  }

  recordRecovery(reason: string): void {
    this.lastRecoveryReason = reason;
    this.recoveryActions += 1;
  }

  telemetry(): ArenaRenderWatchdogTelemetry {
    return {
      status: this.status,
      consecutiveInvalidFrames: this.consecutiveInvalidFrames,
      incidents: this.incidents,
      recoveries: this.recoveries,
      recoveryActions: this.recoveryActions,
      lastRecoveryReason: this.lastRecoveryReason,
      lastHealthyAt: this.lastHealthyAt,
      lastAudit: this.lastAudit,
      fatal: this.status === 'failed',
      fatalReasons: this.status === 'failed' ? [...(this.lastAudit?.reasons ?? [])] : [],
      lastFatalAt: this.lastFatalAt,
    };
  }
}
