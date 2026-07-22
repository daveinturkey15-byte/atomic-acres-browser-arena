import * as THREE from 'three';
import type { RenderProfile } from './render-profile';

export type AtomicSignalMaterialAudit = {
  materials: number;
  colorTexturesCorrected: number;
  dataTexturesCorrected: number;
  anisotropyAdjusted: number;
  darkSurfacesLifted: number;
  roughnessAdjusted: number;
  metalnessAdjusted: number;
};

const COLOR_TEXTURE_KEYS = ['map', 'emissiveMap'] as const;
const DATA_TEXTURE_KEYS = [
  'aoMap',
  'alphaMap',
  'bumpMap',
  'displacementMap',
  'metalnessMap',
  'normalMap',
  'roughnessMap',
] as const;

type TextureMaterial = THREE.MeshStandardMaterial & Record<(typeof COLOR_TEXTURE_KEYS)[number] | (typeof DATA_TEXTURE_KEYS)[number], THREE.Texture | null>;

function clampSigned(value: number, magnitude: number): number {
  return THREE.MathUtils.clamp(value, -magnitude, magnitude);
}

/**
 * Reconciles authored PBR inputs with Atomic Signal's linear-HDR path.
 *
 * glTF loaders usually set these correctly; this audit is intentionally
 * idempotent and changes only mismatches or extreme values. Albedo/emissive
 * textures are colour data, while packed material maps remain linear.
 */
export function tuneMaterialsForAtomicSignal(
  root: THREE.Object3D,
  excludedFromDarkLift: THREE.Object3D | null,
  profile: RenderProfile,
  maximumAnisotropy: number,
): AtomicSignalMaterialAudit {
  const audit: AtomicSignalMaterialAudit = {
    materials: 0,
    colorTexturesCorrected: 0,
    dataTexturesCorrected: 0,
    anisotropyAdjusted: 0,
    darkSurfacesLifted: 0,
    roughnessAdjusted: 0,
    metalnessAdjusted: 0,
  };
  const adjusted = new Set<THREE.Material>();
  const anisotropyCap = Math.max(1, Math.min(maximumAnisotropy, profile === 'blender' ? 8 : 4));

  root.traverse((node) => {
    if (!(node instanceof THREE.Mesh)) return;
    const protectDarkValue = excludedFromDarkLift?.getObjectById(node.id) !== undefined;
    const materials = Array.isArray(node.material) ? node.material : [node.material];
    for (const baseMaterial of materials) {
      if (!(baseMaterial instanceof THREE.MeshStandardMaterial) || adjusted.has(baseMaterial)) continue;
      adjusted.add(baseMaterial);
      audit.materials += 1;
      const material = baseMaterial as TextureMaterial;
      let changed = false;

      for (const key of COLOR_TEXTURE_KEYS) {
        const texture = material[key];
        if (!texture) continue;
        if (texture.colorSpace !== THREE.SRGBColorSpace) {
          texture.colorSpace = THREE.SRGBColorSpace;
          texture.needsUpdate = true;
          audit.colorTexturesCorrected += 1;
          changed = true;
        }
        if (texture.anisotropy !== anisotropyCap) {
          texture.anisotropy = anisotropyCap;
          texture.needsUpdate = true;
          audit.anisotropyAdjusted += 1;
          changed = true;
        }
      }

      for (const key of DATA_TEXTURE_KEYS) {
        const texture = material[key];
        if (!texture) continue;
        if (texture.colorSpace !== THREE.NoColorSpace) {
          texture.colorSpace = THREE.NoColorSpace;
          texture.needsUpdate = true;
          audit.dataTexturesCorrected += 1;
          changed = true;
        }
        if (texture.anisotropy !== anisotropyCap) {
          texture.anisotropy = anisotropyCap;
          texture.needsUpdate = true;
          audit.anisotropyAdjusted += 1;
          changed = true;
        }
      }

      if (!protectDarkValue && Math.max(material.color.r, material.color.g, material.color.b) < 0.16) {
        material.color.lerp(new THREE.Color(0x5b6664), 0.24);
        audit.darkSurfacesLifted += 1;
        changed = true;
      }
      if (material.roughness < 0.28) {
        material.roughness = 0.28;
        audit.roughnessAdjusted += 1;
        changed = true;
      } else if (material.roughness > 0.98) {
        material.roughness = 0.98;
        audit.roughnessAdjusted += 1;
        changed = true;
      }
      if (material.metalness < 0 || material.metalness > 0.82) {
        material.metalness = THREE.MathUtils.clamp(material.metalness, 0, 0.82);
        audit.metalnessAdjusted += 1;
        changed = true;
      }
      material.normalScale.set(
        clampSigned(material.normalScale.x, 1.5),
        clampSigned(material.normalScale.y, 1.5),
      );
      if (changed) material.needsUpdate = true;
    }
  });

  return audit;
}
