import * as THREE from 'three';
import { BOT_EMISSIVE_BRIGHTNESS_SCALE } from './operator-model';

export const REMOTE_HUMAN_READABILITY_COLOR = 0xff8c3a;
export const REMOTE_HUMAN_READABILITY_INTENSITY = BOT_EMISSIVE_BRIGHTNESS_SCALE / 2;
export const REMOTE_HUMAN_READABILITY_MIX = 0.18;

type EmissiveMaterial = THREE.MeshStandardMaterial | THREE.MeshLambertMaterial | THREE.MeshPhongMaterial;

export type RemoteHumanReadabilityTelemetry = Readonly<{
  color: number | null;
  intensity: number | null;
  highlightedMeshes: number;
  highlightedMaterials: number;
  allDepthTested: boolean;
  allDepthWriting: boolean;
}>;

function isEmissiveMaterial(material: THREE.Material): material is EmissiveMaterial {
  return material instanceof THREE.MeshStandardMaterial
    || material instanceof THREE.MeshLambertMaterial
    || material instanceof THREE.MeshPhongMaterial;
}

/**
 * Gives remote human operators a slight orange surface lift without an outline,
 * depth override, or shared-material mutation. Authored rig meshes are marked
 * presentationOnly because their invisible hit proxies own raycasts; that tag
 * must not hide the visible body from this presentation-only treatment.
 */
export function applyRemoteHumanReadabilityHighlight(root: THREE.Object3D): number {
  const orange = new THREE.Color(REMOTE_HUMAN_READABILITY_COLOR);
  const clones = new Map<THREE.Material, THREE.Material>();
  let adjusted = 0;

  const highlight = (material: THREE.Material): THREE.Material => {
    if (!isEmissiveMaterial(material) || material.userData.remoteHumanReadability === true) return material;
    const existing = clones.get(material);
    if (existing) return existing;

    const clone = material.clone() as EmissiveMaterial;
    clone.emissive.lerp(orange, REMOTE_HUMAN_READABILITY_MIX);
    clone.emissiveIntensity = REMOTE_HUMAN_READABILITY_INTENSITY;
    clone.userData.remoteHumanReadability = true;
    clones.set(material, clone);
    adjusted += 1;
    return clone;
  };

  root.traverse((node) => {
    if (!(node instanceof THREE.Mesh)
      || !node.visible
      || node.userData.authoritativeProxy === true
      || node.userData.embeddedWeaponSuppressed === true) return;
    node.material = Array.isArray(node.material)
      ? node.material.map(highlight)
      : highlight(node.material);
  });

  root.userData.remoteHumanReadabilityColor = REMOTE_HUMAN_READABILITY_COLOR;
  root.userData.remoteHumanReadabilityIntensity = REMOTE_HUMAN_READABILITY_INTENSITY;
  root.userData.remoteHumanReadabilityMaterialsAdjusted = (
    Number(root.userData.remoteHumanReadabilityMaterialsAdjusted) || 0
  ) + adjusted;
  return adjusted;
}

export function remoteHumanReadabilityTelemetry(root: THREE.Object3D): RemoteHumanReadabilityTelemetry {
  const materials = new Set<THREE.Material>();
  let highlightedMeshes = 0;
  root.traverse((node) => {
    if (!(node instanceof THREE.Mesh) || !node.visible) return;
    const highlighted = (Array.isArray(node.material) ? node.material : [node.material])
      .filter((material) => material.userData.remoteHumanReadability === true);
    if (highlighted.length === 0) return;
    highlightedMeshes += 1;
    for (const material of highlighted) materials.add(material);
  });
  return Object.freeze({
    color: typeof root.userData.remoteHumanReadabilityColor === 'number'
      ? root.userData.remoteHumanReadabilityColor
      : null,
    intensity: typeof root.userData.remoteHumanReadabilityIntensity === 'number'
      ? root.userData.remoteHumanReadabilityIntensity
      : null,
    highlightedMeshes,
    highlightedMaterials: materials.size,
    allDepthTested: [...materials].every((material) => material.depthTest === true),
    allDepthWriting: [...materials].every((material) => material.depthWrite === true),
  });
}
