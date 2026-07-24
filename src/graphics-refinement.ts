import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import type { Box2 } from './collision';
import type { ArenaId } from './map-selection';
import type { RenderProfile } from './render-profile';

export const SELECTIVE_BLOOM_LAYER = 3;

export type GraphicsEffectsBudget = Readonly<{
  tier: 'off' | 'low' | 'balanced' | 'high' | 'full';
  environmentIntensity: number;
  contactShadowStrength: number;
  bloomStrength: number;
  bloomResolutionScale: number;
  depthFogStrength: number;
  particleDensityScale: number;
  decalLifetimeScale: number;
}>;

export type ArenaShadowVolume = Readonly<{
  halfWidth: number;
  halfHeight: number;
  near: number;
  far: number;
}>;

const SHADOW_VOLUMES: Readonly<Record<ArenaId, ArenaShadowVolume>> = Object.freeze({
  'atomic-acres': Object.freeze({ halfWidth: 54, halfHeight: 60, near: 4, far: 176 }),
  'rustworks-1v1': Object.freeze({ halfWidth: 41, halfHeight: 48, near: 4, far: 180 }),
  'gun-range': Object.freeze({ halfWidth: 38, halfHeight: 66, near: 4, far: 188 }),
  'skyline-terminal': Object.freeze({ halfWidth: 49, halfHeight: 56, near: 4, far: 182 }),
});

export function arenaShadowVolume(arenaId: ArenaId): ArenaShadowVolume {
  return { ...SHADOW_VOLUMES[arenaId] };
}

export function graphicsEffectsBudget(profile: RenderProfile, pixelRatioCap: number): GraphicsEffectsBudget {
  if (profile === 'compat') {
    return {
      tier: 'off', environmentIntensity: 0, contactShadowStrength: 0, bloomStrength: 0,
      bloomResolutionScale: 0, depthFogStrength: 0, particleDensityScale: 0.45, decalLifetimeScale: 0.5,
    };
  }
  if (profile === 'performance') {
    if (pixelRatioCap >= 0.7) {
      return {
        tier: 'balanced', environmentIntensity: 0.5, contactShadowStrength: 0, bloomStrength: 0.055,
        bloomResolutionScale: 0.25, depthFogStrength: 0.035, particleDensityScale: 0.72, decalLifetimeScale: 0.72,
      };
    }
    if (pixelRatioCap >= 0.6) {
      return {
        tier: 'low', environmentIntensity: 0.42, contactShadowStrength: 0, bloomStrength: 0,
        bloomResolutionScale: 0, depthFogStrength: 0.025, particleDensityScale: 0.58, decalLifetimeScale: 0.6,
      };
    }
    return {
      tier: 'low', environmentIntensity: 0.34, contactShadowStrength: 0, bloomStrength: 0,
      bloomResolutionScale: 0, depthFogStrength: 0, particleDensityScale: 0.48, decalLifetimeScale: 0.5,
    };
  }
  if (pixelRatioCap >= 0.95) {
    return {
      tier: 'full', environmentIntensity: 1, contactShadowStrength: 0.16, bloomStrength: 0.16,
      bloomResolutionScale: 0.5, depthFogStrength: 0.085, particleDensityScale: 1, decalLifetimeScale: 1,
    };
  }
  if (pixelRatioCap >= 0.85) {
    return {
      tier: 'high', environmentIntensity: 0.88, contactShadowStrength: 0.12, bloomStrength: 0.12,
      bloomResolutionScale: 0.5, depthFogStrength: 0.07, particleDensityScale: 0.88, decalLifetimeScale: 0.9,
    };
  }
  if (pixelRatioCap >= 0.75) {
    return {
      tier: 'balanced', environmentIntensity: 0.72, contactShadowStrength: 0.065, bloomStrength: 0.08,
      bloomResolutionScale: 0.34, depthFogStrength: 0.05, particleDensityScale: 0.72, decalLifetimeScale: 0.75,
    };
  }
  return {
    tier: 'low', environmentIntensity: 0.56, contactShadowStrength: 0, bloomStrength: 0.045,
    bloomResolutionScale: 0.25, depthFogStrength: 0.035, particleDensityScale: 0.58, decalLifetimeScale: 0.6,
  };
}

function materialsOf(node: THREE.Object3D): THREE.Material[] {
  const material = (node as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined;
  if (!material) return [];
  return Array.isArray(material) ? material : [material];
}

function isBloomMaterial(material: THREE.Material): boolean {
  if (material instanceof THREE.MeshStandardMaterial) {
    return material.emissiveIntensity >= 0.9
      && Math.max(material.emissive.r, material.emissive.g, material.emissive.b) > 0.04;
  }
  return material.blending === THREE.AdditiveBlending
    || (!material.toneMapped && material.transparent && material.opacity >= 0.18);
}

const TEXTURE_KEYS = [
  'map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'emissiveMap', 'alphaMap', 'lightMap',
] as const;

export type GraphicsRefinementTelemetry = Readonly<{
  pass: 62;
  profile: RenderProfile;
  arenaId: ArenaId;
  environmentEnabled: boolean;
  environmentFailure: string | null;
  environmentIntensity: number;
  refinedMaterials: number;
  refinedTextures: number;
  selectiveBloomObjects: number;
  shadowVolume: ArenaShadowVolume;
  budget: GraphicsEffectsBudget;
}>;

/** Presentation-only GPU refinements. It never creates or mutates gameplay authority. */
export class GraphicsRefinementSystem {
  private readonly refined = new WeakSet<THREE.Material>();
  private readonly refinedTextureSet = new WeakSet<THREE.Texture>();
  private environmentTarget: THREE.WebGLRenderTarget | null = null;
  private environmentFailure: string | null = null;
  private refinedMaterials = 0;
  private refinedTextures = 0;
  private selectiveBloomObjects = 0;
  private arenaId: ArenaId = 'atomic-acres';
  private shadowVolume: ArenaShadowVolume = arenaShadowVolume('atomic-acres');
  private budget: GraphicsEffectsBudget;

  constructor(
    private readonly renderer: THREE.WebGLRenderer,
    private readonly scene: THREE.Scene,
    private readonly profile: RenderProfile,
    softwareRenderer: boolean,
    initialPixelRatioCap: number,
  ) {
    this.budget = graphicsEffectsBudget(profile, initialPixelRatioCap);
    if (profile === 'compat' || softwareRenderer) return;
    try {
      const pmrem = new THREE.PMREMGenerator(renderer);
      pmrem.compileCubemapShader();
      const room = new RoomEnvironment();
      this.environmentTarget = pmrem.fromScene(room, profile === 'blender' ? 0.035 : 0.05);
      room.traverse((node) => {
        if (!(node instanceof THREE.Mesh)) return;
        node.geometry.dispose();
        const materials = Array.isArray(node.material) ? node.material : [node.material];
        materials.forEach((material) => material.dispose());
      });
      pmrem.dispose();
      scene.environment = this.environmentTarget.texture;
      scene.environmentIntensity = this.budget.environmentIntensity;
    } catch (error) {
      this.environmentFailure = error instanceof Error ? error.message : String(error);
      scene.environment = null;
    }
  }

  setBudget(budget: GraphicsEffectsBudget): void {
    this.budget = budget;
    if (this.scene.environment) this.scene.environmentIntensity = budget.environmentIntensity;
  }

  refine(root: THREE.Object3D, maximumAnisotropy: number): void {
    const anisotropy = Math.max(1, Math.min(maximumAnisotropy, this.profile === 'blender' ? 8 : 4));
    root.traverse((node) => {
      for (const material of materialsOf(node)) {
        if (!(material instanceof THREE.MeshStandardMaterial) || this.refined.has(material)) continue;
        this.refined.add(material);
        this.refinedMaterials += 1;
        material.roughness = THREE.MathUtils.clamp(material.roughness, material.transparent ? 0.04 : 0.12, 1);
        material.metalness = THREE.MathUtils.clamp(material.metalness, 0, 1);
        material.envMapIntensity = material.transparent
          ? Math.max(material.envMapIntensity, 0.82)
          : material.metalness >= 0.45
            ? Math.max(material.envMapIntensity, 1.08)
            : Math.max(material.envMapIntensity, 0.58);
        material.dithering = this.profile === 'blender';
        const record = material as THREE.MeshStandardMaterial & Record<string, THREE.Texture | null | unknown>;
        for (const key of TEXTURE_KEYS) {
          const texture = record[key];
          if (!(texture instanceof THREE.Texture) || this.refinedTextureSet.has(texture)) continue;
          this.refinedTextureSet.add(texture);
          this.refinedTextures += 1;
          texture.anisotropy = anisotropy;
          texture.needsUpdate = true;
        }
        material.needsUpdate = true;
      }
    });
    this.refreshSelectiveBloom(root);
  }

  refreshSelectiveBloom(root: THREE.Object3D = this.scene): number {
    let count = 0;
    root.traverse((node) => {
      const bloom = materialsOf(node).some(isBloomMaterial);
      if (bloom) {
        node.layers.enable(SELECTIVE_BLOOM_LAYER);
        count += 1;
      } else {
        node.layers.disable(SELECTIVE_BLOOM_LAYER);
      }
    });
    if (root === this.scene) this.selectiveBloomObjects = count;
    else this.selectiveBloomObjects += count;
    return count;
  }

  applyArena(
    arenaId: ArenaId,
    bounds: Box2,
    sunLight: THREE.DirectionalLight,
    sunOffset: readonly [number, number, number],
    shadowMapSize: number,
  ): void {
    this.arenaId = arenaId;
    this.shadowVolume = arenaShadowVolume(arenaId);
    const centreX = (bounds.minX + bounds.maxX) / 2;
    const centreZ = (bounds.minZ + bounds.maxZ) / 2;
    sunLight.target.position.set(centreX, 2.4, centreZ);
    if (!sunLight.target.parent) this.scene.add(sunLight.target);
    sunLight.position.set(centreX + sunOffset[0], sunOffset[1], centreZ + sunOffset[2]);
    if (shadowMapSize > 0) sunLight.shadow.mapSize.set(shadowMapSize, shadowMapSize);
    const camera = sunLight.shadow.camera;
    camera.left = -this.shadowVolume.halfWidth;
    camera.right = this.shadowVolume.halfWidth;
    camera.top = this.shadowVolume.halfHeight;
    camera.bottom = -this.shadowVolume.halfHeight;
    camera.near = this.shadowVolume.near;
    camera.far = this.shadowVolume.far;
    camera.updateProjectionMatrix();
    sunLight.shadow.needsUpdate = true;
  }

  telemetry(): GraphicsRefinementTelemetry {
    return {
      pass: 62,
      profile: this.profile,
      arenaId: this.arenaId,
      environmentEnabled: this.environmentTarget !== null,
      environmentFailure: this.environmentFailure,
      environmentIntensity: this.scene.environment ? this.scene.environmentIntensity : 0,
      refinedMaterials: this.refinedMaterials,
      refinedTextures: this.refinedTextures,
      selectiveBloomObjects: this.selectiveBloomObjects,
      shadowVolume: { ...this.shadowVolume },
      budget: { ...this.budget },
    };
  }

  dispose(): void {
    if (this.scene.environment === this.environmentTarget?.texture) this.scene.environment = null;
    this.environmentTarget?.dispose();
    this.environmentTarget = null;
  }
}
