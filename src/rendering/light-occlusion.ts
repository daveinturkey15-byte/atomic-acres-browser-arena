import * as THREE from 'three';
import type { LightOcclusionPolicy } from './arena-visual-definition';

type OcclusionTaggedLight = THREE.Light & {
  userData: THREE.Light['userData'] & {
    occlusionPolicy?: LightOcclusionPolicy;
    authoredIntensity?: number;
  };
};

/** Keep the visible emitter, baked contribution or global rig; remove the unoccluded runtime volume. */
export function makeEmissiveOnly(light: THREE.Light): void {
  const tagged = light as OcclusionTaggedLight;
  tagged.userData.occlusionPolicy = 'emissive-only';
  tagged.userData.authoredIntensity = light.intensity;
  light.intensity = 0;
  light.castShadow = false;
}

export function makeShadowedLocal(light: THREE.PointLight | THREE.SpotLight): void {
  const tagged = light as OcclusionTaggedLight;
  tagged.userData.occlusionPolicy = 'shadowed-local';
  light.castShadow = true;
}

export type LightOcclusionAudit = Readonly<{
  activeLocalLights: number;
  shadowedLocalLights: number;
  emissiveOnlySources: number;
  violations: readonly string[];
}>;

export function auditLocalLightOcclusion(root: THREE.Object3D, layerMask?: number): LightOcclusionAudit {
  let activeLocalLights = 0;
  let shadowedLocalLights = 0;
  let emissiveOnlySources = 0;
  const violations: string[] = [];
  root.traverse((node) => {
    if (!(node instanceof THREE.PointLight || node instanceof THREE.SpotLight)) return;
    if (layerMask !== undefined && (node.layers.mask & layerMask) === 0) return;
    const tagged = node as OcclusionTaggedLight;
    if (tagged.userData.occlusionPolicy === 'emissive-only') {
      emissiveOnlySources += 1;
      if (node.intensity !== 0 || node.castShadow) violations.push(`${node.name}:emissive-only-runtime-light`);
      return;
    }
    if (node.intensity <= 0) return;
    activeLocalLights += 1;
    if (tagged.userData.occlusionPolicy === 'shadowed-local' && node.castShadow) shadowedLocalLights += 1;
    else violations.push(`${node.name || '(unnamed)'}:unoccluded-active-light`);
  });
  return { activeLocalLights, shadowedLocalLights, emissiveOnlySources, violations };
}
