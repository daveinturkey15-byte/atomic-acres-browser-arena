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
  // HF-359 (Pass 74): ported from the Pass 69 hidden lane (64x64 island).
  'farcrysis': Object.freeze({ halfWidth: 44, halfHeight: 44, near: 4, far: 150 }),
  'high-seas': Object.freeze({ halfWidth: 32, halfHeight: 58, near: 4, far: 190 }),
  // Test1: 64x46 range ground.
  'test1': Object.freeze({ halfWidth: 34, halfHeight: 27, near: 4, far: 176 }),
  // Test2 RE-PINNED 2026-08-31: the arena was rebuilt from 76 x 58 m to
  // 100 x 76 m (docs/TEST2_RAID_LAYOUT_SPEC_2026-08-31.md section 1.3), so the
  // authored 80 x 64 volume no longer covered the playfield - a 10 m band down
  // each long edge and a 6 m band at each end fell outside the cascade. 54 x 42
  // half-extents cover 108 x 84, i.e. the new bounds plus a 4 m margin, the same
  // margin the old pin carried. `far` follows the same rule it always did (the
  // volume's own depth plus the sun's standoff) and rises 182 -> 196 with the
  // longer diagonal (125.7 m against 95.6 m). The map's tallest authored mass
  // is the 4.8 m house parapet, so nothing needs more depth than that.
  'test2': Object.freeze({ halfWidth: 54, halfHeight: 42, near: 4, far: 196 }),
  // MAP3 (PREVIEW): the gallery is 168 x 168 m of playfield, so the volume is
  // square and large. 176 x 176 at mapSize 2048 is 86 mm per texel, which is
  // where arenas/map3.ts derives its 0.085 normal bias from.
  'map3': Object.freeze({ halfWidth: 88, halfHeight: 88, near: 4, far: 300 }),
});

// RoomEnvironment is deliberately only a reflection/indirect-light accent.
// The authored directional and practical lights must remain the dominant
// modelling source or roofs, weapons and interiors lose their shadow shape.
const ARENA_ENVIRONMENT_SCALES: Readonly<Record<ArenaId, number>> = Object.freeze({
  'atomic-acres': 0.24,
  'rustworks-1v1': 0.14,
  'gun-range': 0.1,
  'skyline-terminal': 0.22,
  // HF-359 (Pass 74): ported from the Pass 69 hidden lane.
  'farcrysis': 0.18,
  'high-seas': 0.2,
  // Test1 dusty matte plywood/sandbag range; Test2 reflective travertine and pool.
  // Test2 re-checked against the 2026-08-31 rebuild and HELD at 0.22: the
  // rebuild changed the arena's extent and its verticality, not its surface
  // mix - travertine paving, stucco walls, a stone kerb vocabulary and one
  // pool, in the same proportions the 0.22 was fitted to.
  'test1': 0.16,
  'test2': 0.22,
  // MAP3 (PREVIEW): matte paving and stone piers with one shallow water basin
  // - between Test1's dry range (0.16) and Test2's travertine-and-pool (0.22).
  'map3': 0.18,
});

export function arenaEnvironmentScale(arenaId: ArenaId): number {
  return ARENA_ENVIRONMENT_SCALES[arenaId];
}

export function arenaShadowVolume(arenaId: ArenaId): ArenaShadowVolume {
  return { ...SHADOW_VOLUMES[arenaId] };
}

/**
 * Returns the authored roughness clamped to valid PBR range.
 * reflectionQuality no longer raises roughness (that was backwards).
 * Instead, reflectionQuality gates PMREM resolution in arena-environment-ibl.
 */
export function effectivePbrRoughness(authoredRoughness: number, transparent: boolean): number {
  return THREE.MathUtils.clamp(authoredRoughness, transparent ? 0.04 : 0.12, 1);
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
  requestedAnisotropy: number;
  reflectionScale: number;
  selectiveBloomObjects: number;
  shadowVolume: ArenaShadowVolume;
  budget: GraphicsEffectsBudget;
}>;

/** Presentation-only GPU refinements. It never creates or mutates gameplay authority. */
export class GraphicsRefinementSystem {
  private readonly refined = new WeakSet<THREE.Material>();
  private readonly refinedTextureSet = new WeakSet<THREE.Texture>();
  private readonly authoredMaterial = new WeakMap<THREE.MeshStandardMaterial, Readonly<{
    roughness: number;
    environmentIntensity: number;
    dithering: boolean;
  }>>();
  private environmentTarget: THREE.WebGLRenderTarget | null = null;
  private environmentFailure: string | null = null;
  private refinedMaterials = 0;
  private refinedTextures = 0;
  private selectiveBloomObjects = 0;
  private arenaId: ArenaId = 'atomic-acres';
  private shadowVolume: ArenaShadowVolume = arenaShadowVolume('atomic-acres');
  private budget: GraphicsEffectsBudget;
  private requestedAnisotropy = 4;
  private reflectionScale = 1;

  constructor(
    renderer: THREE.WebGLRenderer | null,
    private readonly scene: THREE.Scene,
    private profile: RenderProfile,
    softwareRenderer: boolean,
    initialPixelRatioCap: number,
    requestedAnisotropy = profile === 'blender' ? 8 : 4,
    initialReflectionScale = 1,
  ) {
    this.budget = graphicsEffectsBudget(profile, initialPixelRatioCap);
    this.requestedAnisotropy = requestedAnisotropy;
    this.reflectionScale = initialReflectionScale;
    if (!renderer || profile === 'compat' || softwareRenderer) return;
    // NOTE: PMREM environment map is now handled by arena-environment-ibl.ts on the WebGPU path.
    // This WebGL path keeps the RoomEnvironment fallback for compatibility.
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
      this.applyEnvironmentIntensity();
    } catch (error) {
      this.environmentFailure = error instanceof Error ? error.message : String(error);
      scene.environment = null;
    }
  }

  setBudget(budget: GraphicsEffectsBudget): void {
    this.budget = budget;
    this.applyEnvironmentIntensity();
  }

  /** Re-applies mutable material knobs without rebuilding geometry or render targets. */
  setRuntimeConfiguration(
    profile: RenderProfile,
    requestedAnisotropy: number,
    reflectionScale: number,
    maximumAnisotropy: number,
  ): void {
    this.profile = profile;
    this.requestedAnisotropy = requestedAnisotropy;
    this.reflectionScale = reflectionScale;
    this.refine(this.scene, maximumAnisotropy);
    this.applyEnvironmentIntensity();
  }

  private applyEnvironmentIntensity(): void {
    if (!this.scene.environment) return;
    this.scene.environmentIntensity = this.budget.environmentIntensity * arenaEnvironmentScale(this.arenaId) * this.reflectionScale;
  }

  refine(root: THREE.Object3D, maximumAnisotropy: number): void {
    const anisotropy = Math.max(1, Math.min(maximumAnisotropy, this.requestedAnisotropy));
    root.traverse((node) => {
      for (const material of materialsOf(node)) {
        if (!(material instanceof THREE.MeshStandardMaterial)) continue;
        let authored = this.authoredMaterial.get(material);
        if (!authored) {
          authored = Object.freeze({
            roughness: material.roughness,
            environmentIntensity: material.envMapIntensity,
            dithering: material.dithering,
          });
          this.authoredMaterial.set(material, authored);
        }
        if (!this.refined.has(material)) {
          this.refined.add(material);
          this.refinedMaterials += 1;
        }
        // Use authored roughness clamped to PBR range (reflectionQuality gates PMREM resolution, not roughness)
        material.roughness = effectivePbrRoughness(authored.roughness, material.transparent);
        material.metalness = THREE.MathUtils.clamp(material.metalness, 0, 1);
        const authoredEnvironmentIntensity = material.transparent
          ? Math.max(authored.environmentIntensity, 0.48)
          : material.metalness >= 0.45
            ? Math.max(authored.environmentIntensity, 0.82)
            : Math.max(authored.environmentIntensity, 0.3);
        material.envMapIntensity = authoredEnvironmentIntensity * this.reflectionScale;
        material.dithering = this.profile === 'blender' || authored.dithering;
        const record = material as THREE.MeshStandardMaterial & Record<string, THREE.Texture | null | unknown>;
        for (const key of TEXTURE_KEYS) {
          const texture = record[key];
          if (!(texture instanceof THREE.Texture)) continue;
          if (!this.refinedTextureSet.has(texture)) {
            this.refinedTextureSet.add(texture);
            this.refinedTextures += 1;
          }
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
    this.applyEnvironmentIntensity();
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
      requestedAnisotropy: this.requestedAnisotropy,
      reflectionScale: this.reflectionScale,
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
