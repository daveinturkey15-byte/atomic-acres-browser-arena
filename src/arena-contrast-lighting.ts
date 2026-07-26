import * as THREE from 'three';
import { RUSTWORKS_WORK_LIGHTS } from './additional-maps';
import type { ArenaId } from './map-selection';
import type { RenderProfile } from './render-profile';
import type {
  ArenaInteriorVolumeDefinition,
  ArenaPracticalMotionDefinition,
  ArenaSpotLightDefinition,
  ArenaVector3,
  ArenaVisualDefinition,
} from './rendering/arena-visual-definition';
import { auditLocalLightOcclusion, makeShadowedLocal, type LightOcclusionAudit } from './rendering/light-occlusion';

type ArenaKeyLight = Readonly<{
  position: ArenaVector3;
  target: ArenaVector3;
  color: number;
  intensity: number;
  distance: number;
  angle: number;
  penumbra?: number;
  decay?: number;
  shadowMapSize?: number;
  motion?: ArenaPracticalMotionDefinition;
}>;

// Definitions without canonical runtime pose metadata retain their Pass 64
// adapter until each arena is migrated. Gun Range is intentionally absent: its
// full pose, target, volume and motion contract now lives in its arena definition.
const LEGACY_KEY_LIGHTS: Readonly<Partial<Record<ArenaId, readonly ArenaKeyLight[]>>> = {
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
  'skyline-terminal': [
    { position: [-20, 6.7, -30], target: [-8, 0.8, -19], color: 0xbcecff, intensity: 20, distance: 34, angle: 0.62 },
    { position: [20, 6.7, -24], target: [8, 0.8, -17], color: 0xffc68a, intensity: 17, distance: 34, angle: 0.62 },
  ],
};

export type ArenaPracticalLightSample = Readonly<{
  intensity: number;
  target: ArenaVector3;
}>;

function sineMotionOffset(nowMs: number, frequencyHz: number, phaseRadians: number): number {
  return Math.sin(nowMs / 1_000 * Math.PI * 2 * frequencyHz + phaseRadians);
}

export function sampleArenaPracticalLight(
  light: Pick<ArenaSpotLightDefinition, 'intensity' | 'target' | 'motion'>,
  nowMs: number,
): ArenaPracticalLightSample {
  const intensityMotion = light.motion?.intensity;
  const targetMotion = light.motion?.target;
  const intensity = intensityMotion
    ? light.intensity * (1 + intensityMotion.amplitudeRatio
      * sineMotionOffset(nowMs, intensityMotion.frequencyHz, intensityMotion.phaseRadians))
    : light.intensity;
  const targetOffset = targetMotion
    ? sineMotionOffset(nowMs, targetMotion.frequencyHz, targetMotion.phaseRadians)
    : 0;
  return {
    intensity,
    target: [
      light.target[0] + (targetMotion?.amplitude[0] ?? 0) * targetOffset,
      light.target[1] + (targetMotion?.amplitude[1] ?? 0) * targetOffset,
      light.target[2] + (targetMotion?.amplitude[2] ?? 0) * targetOffset,
    ],
  };
}

export type ArenaAuthoredLightTelemetry = Readonly<{
  practicalId: string;
  position: ArenaVector3;
  target: ArenaVector3;
  intensity: number;
  distance: number;
  angle: number;
  shadowMapSize: number;
  intendedVolume: ArenaInteriorVolumeDefinition;
  motion: ArenaPracticalMotionDefinition | null;
}>;

export type ArenaContrastLightingTelemetry = Readonly<{
  profile: RenderProfile;
  arenaId: ArenaId;
  definitionId: ArenaId | null;
  practicalPolicyIds: readonly string[];
  maximumShadowLights: number;
  activeLights: number;
  shadowCastingLights: number;
  authoredLights: readonly ArenaAuthoredLightTelemetry[];
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
  private authoredLights: readonly ArenaAuthoredLightTelemetry[] = [];
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
    this.authoredLights = definition.lighting.practicals.flatMap((practical) => practical.light ? [{
      practicalId: practical.id,
      position: [...practical.light.position] as ArenaVector3,
      target: [...practical.light.target] as ArenaVector3,
      intensity: practical.light.intensity,
      distance: practical.light.distance,
      angle: practical.light.angle,
      shadowMapSize: practical.light.shadowMapSize,
      intendedVolume: {
        id: practical.light.intendedVolume.id,
        minimum: [...practical.light.intendedVolume.minimum] as ArenaVector3,
        maximum: [...practical.light.intendedVolume.maximum] as ArenaVector3,
      },
      motion: practical.light.motion ?? null,
    }] : []);
    this.maximumShadowLights = definition.budgets.maximumShadowLights;
    // These keys have no baked occlusion. On a profile without local shadow
    // maps they would light through walls, so emissive geometry owns them.
    if (this.profile !== 'blender' || this.softwareRenderer) return;
    const shadowedPolicies = definition.lighting.practicals.filter((practical) => practical.policy === 'shadowed-local');
    const canonicalEntries = shadowedPolicies.flatMap((policy) => policy.light ? [{ policy, spec: policy.light }] : []);
    const resolvedEntries = canonicalEntries.length > 0
      ? canonicalEntries
      : (LEGACY_KEY_LIGHTS[definition.id] ?? []).map((spec, index) => ({
        policy: shadowedPolicies[Math.min(index, shadowedPolicies.length - 1)],
        spec,
      }));
    const allowedCount = Math.min(
      resolvedEntries.length,
      shadowedPolicies.length === 0 ? 0 : definition.budgets.maximumShadowLights,
    );
    if (allowedCount === 0) return;
    const root = new THREE.Group();
    root.name = `pass64-${definition.id}-definition-practicals`;
    root.userData.presentationOnly = true;
    root.userData.blocksShots = false;
    root.userData.arenaLightingDefinitionId = definition.id;
    for (const [index, entry] of resolvedEntries.slice(0, allowedCount).entries()) {
      const { policy, spec } = entry;
      const light = new THREE.SpotLight(
        spec.color,
        spec.intensity,
        Math.min(spec.distance, policy.maximumDistance),
        spec.angle,
        spec.penumbra ?? 0.7,
        spec.decay ?? 2,
      );
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
      light.userData.authoredMotion = spec.motion ?? null;
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
    if (!this.activeRoot) return;
    const seconds = nowMs / 1_000;
    let index = 0;
    for (const node of this.activeRoot.children) {
      if (!(node instanceof THREE.SpotLight)) continue;
      const base = Number(node.userData.authoredIntensity ?? node.intensity);
      const authoredTarget = node.userData.authoredTarget as readonly number[] | undefined;
      const authoredMotion = node.userData.authoredMotion as ArenaPracticalMotionDefinition | null | undefined;
      if (authoredMotion && authoredTarget?.length === 3) {
        const intensityMotion = authoredMotion.intensity;
        const targetMotion = authoredMotion.target;
        const intensityOffset = intensityMotion
          ? sineMotionOffset(nowMs, intensityMotion.frequencyHz, intensityMotion.phaseRadians)
          : 0;
        const targetOffset = targetMotion
          ? sineMotionOffset(nowMs, targetMotion.frequencyHz, targetMotion.phaseRadians)
          : 0;
        node.intensity = base * (1 + (intensityMotion?.amplitudeRatio ?? 0) * intensityOffset);
        node.target.position.set(
          authoredTarget[0] + (targetMotion?.amplitude[0] ?? 0) * targetOffset,
          authoredTarget[1] + (targetMotion?.amplitude[1] ?? 0) * targetOffset,
          authoredTarget[2] + (targetMotion?.amplitude[2] ?? 0) * targetOffset,
        );
      } else if (this.arenaId === 'rustworks-1v1') {
        // Preserve the accepted Pass 64 RustRig pulse until that arena's
        // legacy fixture adapter is migrated into canonical definition data.
        const phase = index * 1.73;
        const amplitude = 0.075;
        node.intensity = base * (1 - amplitude + amplitude * (Math.sin(seconds * 0.72 + phase) * 0.5 + 0.5));
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
      authoredLights: this.authoredLights,
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
    this.authoredLights = [];
  }
}
