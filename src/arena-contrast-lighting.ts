import * as THREE from 'three';
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
}>;

const KEY_LIGHTS = {
  'atomic-acres': [
    { position: [-26, 11, 12], target: [-18, 1.8, 2], color: 0xffc981, intensity: 13, distance: 32, angle: 0.62 },
    { position: [26, 10, -12], target: [18, 1.8, -2], color: 0xa9d8ff, intensity: 11, distance: 31, angle: 0.6 },
  ],
  // Rustworks already has authored industrial floods. Its definition keeps
  // them emissive-only, so it intentionally allocates no local shadow key.
  'rustworks-1v1': [],
  'gun-range': [
    { position: [0, 6.2, 12], target: [0, 1.6, -17], color: 0xd8f3ff, intensity: 14, distance: 45, angle: 0.58 },
  ],
  'skyline-terminal': [
    { position: [-20, 6.7, -30], target: [-8, 0.8, -19], color: 0xbcecff, intensity: 20, distance: 34, angle: 0.62 },
    { position: [20, 6.7, -24], target: [8, 0.8, -17], color: 0xffc68a, intensity: 17, distance: 34, angle: 0.62 },
  ],
} as const satisfies Readonly<Record<ArenaId, readonly ArenaKeyLight[]>>;

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
      light.shadow.mapSize.set(256, 256);
      light.shadow.camera.near = 0.5;
      light.shadow.camera.far = Math.min(spec.distance, policy.maximumDistance);
      light.shadow.bias = -0.00022;
      light.shadow.normalBias = definition.shadows.normalBias;
      light.shadow.radius = 1.5;
      light.userData.presentationOnly = true;
      light.userData.blocksShots = false;
      light.userData.practicalPolicyId = policy.id;
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
