import * as THREE from 'three';
import { RUSTWORKS_WORK_LIGHTS } from './additional-maps';
import type { ArenaId } from './map-selection';
import type { RenderProfile } from './render-profile';
import type { ArenaVisualDefinition } from './rendering/arena-visual-definition';
import { auditLocalLightOcclusion, makeShadowedLocal, type LightOcclusionAudit } from './rendering/light-occlusion';

type ArenaKeyLight = Readonly<{
  position: readonly [number, number, number];
  target: readonly [number, number, number];
  color: number;
  intensity: number;
  distance: number;
  angle: number;
  shadowMapSize?: number;
}>;

const KEY_LIGHTS: Readonly<Record<ArenaId, readonly ArenaKeyLight[]>> = {
  'atomic-acres': [
    { position: [-26, 11, 12], target: [-18, 1.8, 2], color: 0xffc981, intensity: 13, distance: 32, angle: 0.62 },
    { position: [26, 10, -12], target: [18, 1.8, -2], color: 0xa9d8ff, intensity: 11, distance: 31, angle: 0.6 },
  ],
  // The visual fixture and shadowed volume share authored coordinates. The
  // opposite head remains emissive-only so the moon + practical stay within
  // RustRig's two-shadow-light budget.
  'rustworks-1v1': RUSTWORKS_WORK_LIGHTS
    .filter((fixture) => fixture.shadowed)
    .map((fixture) => ({
      position: fixture.position,
      target: fixture.target,
      color: fixture.color,
      intensity: fixture.intensity,
      distance: fixture.distance,
      angle: fixture.angle,
      shadowMapSize: 512,
    })),
  'gun-range': [
    { position: [0, 6.2, 12], target: [0, 1.6, -17], color: 0xd8f3ff, intensity: 14, distance: 45, angle: 0.58 },
  ],
  'skyline-terminal': [
    { position: [-20, 6.7, -30], target: [-8, 0.8, -19], color: 0xbcecff, intensity: 20, distance: 34, angle: 0.62 },
    { position: [20, 6.7, -24], target: [8, 0.8, -17], color: 0xffc68a, intensity: 17, distance: 34, angle: 0.62 },
  ],
  // Golden-hour beach key light + a cooler dapple key over the jungle core.
  'farcrysis': [
    { position: [-26, 9.5, -26], target: [-8, 1.6, -8], color: 0xffc981, intensity: 15, distance: 38, angle: 0.6 },
    { position: [18, 8.5, 20], target: [6, 1.6, 6], color: 0x9fd8a8, intensity: 12, distance: 30, angle: 0.58 },
  ],
};

export type ArenaContrastLightingTelemetry = Readonly<{
  profile: RenderProfile;
  arenaId: ArenaId;
  definitionId: ArenaId | null;
  practicalPolicyIds: readonly string[];
  maximumShadowLights: number;
  activeLights: number;
  shadowCastingLights: number;
  occlusion: LightOcclusionAudit;
}>;

/**
 * A bounded practical-light rig for local modelling and moving-caster shadows.
 * It is presentation-only and never participates in map or combat authority.
 */
export class ArenaContrastLighting {
  private activeRoot: THREE.Group | null = null;
  private arenaId: ArenaId = 'atomic-acres';
  private definitionId: ArenaId | null = null;
  private practicalPolicyIds: readonly string[] = [];
  private maximumShadowLights = 0;

  constructor(
    private readonly scene: THREE.Scene,
    private readonly profile: RenderProfile,
    private readonly softwareRenderer = false,
  ) {
    // Definition application below is the sole construction boundary. No
    // lighting roots for non-selected arenas exist in the gameplay scene.
  }

  applyDefinition(definition: ArenaVisualDefinition): void {
    this.disposeActiveRoot();
    this.arenaId = definition.id;
    this.definitionId = definition.id;
    this.practicalPolicyIds = definition.lighting.practicals.map((practical) => practical.id);
    this.maximumShadowLights = definition.budgets.maximumShadowLights;
    // These keys have no baked occlusion. On a profile without local shadow
    // maps they would light through walls, so emissive geometry owns them.
    if (this.profile !== 'blender' || this.softwareRenderer) return;
    const shadowedPolicies = definition.lighting.practicals.filter((practical) => practical.policy === 'shadowed-local');
    const allowedCount = Math.min(
      KEY_LIGHTS[definition.id].length,
      shadowedPolicies.length === 0 ? 0 : definition.budgets.maximumShadowLights,
    );
    if (allowedCount === 0) return;
    const root = new THREE.Group();
    root.name = `pass64-${definition.id}-definition-practicals`;
    root.userData.presentationOnly = true;
    root.userData.blocksShots = false;
    root.userData.arenaLightingDefinitionId = definition.id;
    for (const [index, spec] of KEY_LIGHTS[definition.id].slice(0, allowedCount).entries()) {
      const policy = shadowedPolicies[Math.min(index, shadowedPolicies.length - 1)];
      const light = new THREE.SpotLight(spec.color, spec.intensity, Math.min(spec.distance, policy.maximumDistance), spec.angle, 0.7, 2);
      light.name = `${definition.id}-${policy.id}-${index + 1}`;
      light.position.set(spec.position[0], spec.position[1], spec.position[2]);
      makeShadowedLocal(light);
      const shadowMapSize = spec.shadowMapSize ?? 256;
      light.shadow.mapSize.set(shadowMapSize, shadowMapSize);
      light.shadow.camera.near = 0.5;
      light.shadow.camera.far = Math.min(spec.distance, policy.maximumDistance);
      light.shadow.bias = -0.00022;
      light.shadow.normalBias = definition.shadows.normalBias;
      light.shadow.radius = 1.5;
      light.userData.presentationOnly = true;
      light.userData.blocksShots = false;
      light.userData.practicalPolicyId = policy.id;
      light.userData.authoredIntensity = spec.intensity;
      light.userData.authoredTarget = [...spec.target];
      const target = new THREE.Object3D();
      target.name = `${light.name}-target`;
      target.position.set(spec.target[0], spec.target[1], spec.target[2]);
      target.userData.presentationOnly = true;
      target.userData.blocksShots = false;
      light.target = target;
      root.add(light, target);
    }
    this.activeRoot = root;
    this.scene.add(root);
  }

  /** Slow deterministic practical-light motion; presentation only, no allocations. */
  update(nowMs: number): void {
    if (!this.activeRoot || (this.arenaId !== 'rustworks-1v1' && this.arenaId !== 'gun-range')) return;
    const seconds = nowMs / 1_000;
    let index = 0;
    for (const node of this.activeRoot.children) {
      if (!(node instanceof THREE.SpotLight)) continue;
      const base = Number(node.userData.authoredIntensity ?? node.intensity);
      const phase = index * 1.73;
      const amplitude = this.arenaId === 'rustworks-1v1' ? 0.075 : 0.045;
      node.intensity = base * (1 - amplitude + amplitude * (Math.sin(seconds * 0.72 + phase) * 0.5 + 0.5));
      const authoredTarget = node.userData.authoredTarget as readonly number[] | undefined;
      if (this.arenaId === 'gun-range' && authoredTarget?.length === 3) {
        node.target.position.x = authoredTarget[0] + Math.sin(seconds * 0.24) * 2.4;
      }
      index += 1;
    }
  }

  telemetry(): ArenaContrastLightingTelemetry {
    const root = this.activeRoot;
    const activeLights = root?.children.filter((node) => node instanceof THREE.SpotLight).length ?? 0;
    const shadowCastingLights = root?.children.filter((node) => node instanceof THREE.SpotLight && node.castShadow).length ?? 0;
    return {
      profile: this.profile,
      arenaId: this.arenaId,
      definitionId: this.definitionId,
      practicalPolicyIds: [...this.practicalPolicyIds],
      maximumShadowLights: this.maximumShadowLights,
      activeLights,
      shadowCastingLights,
      occlusion: root ? auditLocalLightOcclusion(root) : { activeLocalLights: 0, shadowedLocalLights: 0, emissiveOnlySources: 0, violations: [] },
    };
  }

  private disposeActiveRoot(): void {
    if (!this.activeRoot) return;
    this.scene.remove(this.activeRoot);
    this.activeRoot.traverse((node) => {
      if (node instanceof THREE.SpotLight) node.shadow.map?.dispose();
    });
    this.activeRoot.clear();
    this.activeRoot = null;
  }

  dispose(): void {
    this.disposeActiveRoot();
    this.definitionId = null;
  }
}
