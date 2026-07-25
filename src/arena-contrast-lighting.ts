import * as THREE from 'three';
import type { ArenaId } from './map-selection';
import type { RenderProfile } from './render-profile';
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
  // Rustworks already has sixteen authored industrial floods and Gun Range has
  // ceiling, neon and armory practicals. Arena-wide keys on either map erase
  // their intentionally dark zones instead of adding useful modelling.
  'rustworks-1v1': [],
  'gun-range': [],
  'skyline-terminal': [
    { position: [-20, 6.7, -30], target: [-8, 0.8, -19], color: 0xbcecff, intensity: 20, distance: 34, angle: 0.62 },
    { position: [20, 6.7, -24], target: [8, 0.8, -17], color: 0xffc68a, intensity: 17, distance: 34, angle: 0.62 },
  ],
} as const satisfies Readonly<Record<ArenaId, readonly ArenaKeyLight[]>>;

export type ArenaContrastLightingTelemetry = Readonly<{
  profile: RenderProfile;
  arenaId: ArenaId;
  activeLights: number;
  shadowCastingLights: number;
  occlusion: LightOcclusionAudit;
}>;

/**
 * A bounded practical-light rig for local modelling and moving-caster shadows.
 * It is presentation-only and never participates in map or combat authority.
 */
export class ArenaContrastLighting {
  private readonly roots = new Map<ArenaId, THREE.Group>();
  private arenaId: ArenaId = 'atomic-acres';

  constructor(
    private readonly scene: THREE.Scene,
    private readonly profile: RenderProfile,
    softwareRenderer = false,
  ) {
    // These keys have no baked occlusion. On a profile without local shadow
    // maps they would light through walls, so the emissive/global rig owns the
    // Performance and Compatibility presentations instead.
    if (profile !== 'blender' || softwareRenderer) return;
    const intensityScale = 1;
    for (const [arenaId, specs] of Object.entries(KEY_LIGHTS) as Array<[ArenaId, readonly ArenaKeyLight[]]>) {
      const root = new THREE.Group();
      root.name = `pass62-${arenaId}-contrast-lighting`;
      root.userData.presentationOnly = true;
      root.userData.blocksShots = false;
      for (const [index, spec] of specs.entries()) {
        const light = new THREE.SpotLight(
          spec.color,
          spec.intensity * intensityScale,
          spec.distance,
          spec.angle,
          0.7,
          2,
        );
        light.name = `${arenaId}-contrast-key-${index + 1}`;
        light.position.set(...spec.position);
        makeShadowedLocal(light);
        light.shadow.mapSize.set(256, 256);
        light.shadow.camera.near = 0.5;
        light.shadow.camera.far = spec.distance;
        light.shadow.bias = -0.00022;
        light.shadow.normalBias = 0.035;
        light.shadow.radius = 1.5;
        light.userData.presentationOnly = true;
        light.userData.blocksShots = false;
        const target = new THREE.Object3D();
        target.name = `${light.name}-target`;
        target.position.set(...spec.target);
        target.userData.presentationOnly = true;
        target.userData.blocksShots = false;
        light.target = target;
        root.add(light, target);
      }
      root.visible = arenaId === this.arenaId;
      this.roots.set(arenaId, root);
      scene.add(root);
    }
  }

  setArena(arenaId: ArenaId): void {
    this.arenaId = arenaId;
    for (const [candidate, root] of this.roots) root.visible = candidate === arenaId;
  }

  telemetry(): ArenaContrastLightingTelemetry {
    const root = this.roots.get(this.arenaId);
    const activeLights = root?.children.filter((node) => node instanceof THREE.SpotLight).length ?? 0;
    const shadowCastingLights = root?.children.filter((node) => node instanceof THREE.SpotLight && node.castShadow).length ?? 0;
    return {
      profile: this.profile,
      arenaId: this.arenaId,
      activeLights,
      shadowCastingLights,
      occlusion: root ? auditLocalLightOcclusion(root) : { activeLocalLights: 0, shadowedLocalLights: 0, emissiveOnlySources: 0, violations: [] },
    };
  }

  dispose(): void {
    for (const root of this.roots.values()) {
      this.scene.remove(root);
      root.traverse((node) => {
        if (node instanceof THREE.SpotLight) node.shadow.map?.dispose();
      });
    }
    this.roots.clear();
  }
}
