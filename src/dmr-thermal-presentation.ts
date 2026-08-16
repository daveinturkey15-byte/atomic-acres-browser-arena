import * as THREE from 'three';
import type { PresentationPrewarmRuntime } from './rendering/render-runtime';

export const DMR_THERMAL_MAGNIFICATION = 2.5;
export const DMR_THERMAL_MAX_CONTACTS = 16;
export const DMR_THERMAL_WORLD_DRAW_CALLS = 0;
export const DMR_THERMAL_OCCLUSION_CHECKS_PER_FRAME = 2;
export const DMR_THERMAL_TARGET_POLICY = 'living-friendly-and-hostile' as const;
export const DMR_THERMAL_OCCLUSION_POLICY = 'through-wall-reveal' as const;
export const DMR_THERMAL_MODEL_POLICY = 'occlusion-conditioned-single-exact-animated-thermal-operator' as const;

export type DmrThermalRelation = 'friendly' | 'hostile';

export type DmrThermalContact = Readonly<{
  id: string;
  kind: 'player' | 'bot';
  relation: DmrThermalRelation;
  position: THREE.Vector3;
  living: boolean;
  solidOccluded: boolean;
}>;

/**
 * Selection remains the existing authority-approved living-contact set. The
 * optic does not infer targets from pixels or solid occlusion; presentation is
 * delegated to ThermalGhostPresentation with the real remote/bot roots.
 */
export function selectDmrThermalContacts(
  contacts: readonly DmrThermalContact[],
  maximum = DMR_THERMAL_MAX_CONTACTS,
): readonly DmrThermalContact[] {
  const selected: DmrThermalContact[] = [];
  const seen = new Set<string>();
  const boundedMaximum = Math.max(0, Math.min(DMR_THERMAL_MAX_CONTACTS, Math.floor(maximum)));
  for (const contact of contacts) {
    if (selected.length >= boundedMaximum) break;
    if (!contact.living || contact.id.length === 0 || seen.has(contact.id)) continue;
    seen.add(contact.id);
    selected.push(contact);
  }
  return Object.freeze(selected);
}

export function dmrThermalOcclusionBudget(contactCount: number): number {
  if (!Number.isFinite(contactCount)) return 0;
  return Math.min(DMR_THERMAL_OCCLUSION_CHECKS_PER_FRAME, Math.max(0, Math.floor(contactCount)));
}

/**
 * Owns the M14 optic lifecycle and bounded telemetry only. Earlier revisions
 * created a camera-facing pawn texture, instanced planes and DOM body markers.
 * Those proxies are intentionally absent: one shared exact-operator renderer
 * owns all through-wall body presentation.
 */
export class DmrThermalPresentation {
  readonly worldRoot = new THREE.Group();
  private active = false;
  private visibleHostiles = 0;
  private visibleFriendlies = 0;
  private gpuPrewarmGeneration = -1;

  constructor(private readonly scene: THREE.Scene, private readonly overlay: HTMLElement) {
    this.worldRoot.name = 'm14-ebr-through-wall-exact-operator-anchor';
    this.worldRoot.userData.presentationOnly = true;
    this.worldRoot.userData.modelPolicy = DMR_THERMAL_MODEL_POLICY;
    this.worldRoot.userData.proxyMeshes = 0;
    this.worldRoot.visible = false;
    scene.add(this.worldRoot);
  }

  async prewarm(
    _runtime: PresentationPrewarmRuntime,
    _camera: THREE.Camera,
    sceneGeneration = 0,
  ): Promise<void> {
    // Exact source materials/skins are prepared by the shared match-bound
    // ThermalGhostPresentation path. There is no second proxy pipeline.
    this.gpuPrewarmGeneration = sceneGeneration;
  }

  update(_camera: THREE.Camera, candidates: readonly DmrThermalContact[], active: boolean): void {
    if (!active && !this.active) return;
    this.active = active;
    this.overlay.hidden = !active;
    this.worldRoot.visible = false;
    this.visibleHostiles = 0;
    this.visibleFriendlies = 0;
    if (!active) return;
    for (const contact of selectDmrThermalContacts(candidates)) {
      if (contact.relation === 'hostile') this.visibleHostiles += 1;
      else this.visibleFriendlies += 1;
    }
  }

  telemetry(): Readonly<{
    active: boolean;
    contacts: number;
    hostiles: number;
    friendlies: number;
    maximumContacts: number;
    worldDrawCalls: typeof DMR_THERMAL_WORLD_DRAW_CALLS;
    occlusionChecksPerFrame: typeof DMR_THERMAL_OCCLUSION_CHECKS_PER_FRAME;
    gpuPrewarmGeneration: number;
    targetPolicy: typeof DMR_THERMAL_TARGET_POLICY;
    occlusionPolicy: typeof DMR_THERMAL_OCCLUSION_POLICY;
    modelPolicy: typeof DMR_THERMAL_MODEL_POLICY;
    proxyMeshes: 0;
    domBodyMarkers: 0;
  }> {
    return Object.freeze({
      active: !this.overlay.hidden,
      contacts: this.visibleHostiles + this.visibleFriendlies,
      hostiles: this.visibleHostiles,
      friendlies: this.visibleFriendlies,
      maximumContacts: DMR_THERMAL_MAX_CONTACTS,
      worldDrawCalls: DMR_THERMAL_WORLD_DRAW_CALLS,
      occlusionChecksPerFrame: DMR_THERMAL_OCCLUSION_CHECKS_PER_FRAME,
      gpuPrewarmGeneration: this.gpuPrewarmGeneration,
      targetPolicy: DMR_THERMAL_TARGET_POLICY,
      occlusionPolicy: DMR_THERMAL_OCCLUSION_POLICY,
      modelPolicy: DMR_THERMAL_MODEL_POLICY,
      proxyMeshes: 0,
      domBodyMarkers: 0,
    });
  }

  terminalDispose(): void {
    this.scene.remove(this.worldRoot);
  }
}
