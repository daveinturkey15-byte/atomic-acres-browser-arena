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
  // A zero-intensity Light still participates in Three's WebGPU light graph.
  // Atomic Acres carries thirteen of these metadata-only sources; leaving them
  // visible makes every PBR material compile against lights that contribute no
  // pixels and can exhaust D3D12 pipeline-state compilation in constrained
  // browser processes. The authored emissive meshes remain visible, while the
  // inert Light nodes stay available for telemetry without entering rendering.
  light.visible = false;
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
  clusteredLocalLights: number;
  emissiveOnlySources: number;
  violations: readonly string[];
}>;

export function auditLocalLightOcclusion(root: THREE.Object3D, layerMask?: number): LightOcclusionAudit {
  let activeLocalLights = 0;
  let shadowedLocalLights = 0;
  let clusteredLocalLights = 0;
  let emissiveOnlySources = 0;
  const violations: string[] = [];
  root.traverse((node) => {
    if (!(node instanceof THREE.PointLight || node instanceof THREE.SpotLight)) return;
    if (layerMask !== undefined && (node.layers.mask & layerMask) === 0) return;
    const tagged = node as OcclusionTaggedLight;
    if (tagged.userData.occlusionPolicy === 'emissive-only') {
      emissiveOnlySources += 1;
      if (node.visible) violations.push(`${node.name || '(unnamed)'}:emissive-only-render-visible`);
      if (node.intensity !== 0 || node.castShadow) violations.push(`${node.name}:emissive-only-runtime-light`);
      return;
    }
    if (node.intensity <= 0) return;
    activeLocalLights += 1;
    // Nuketown2's clustered registry is an explicit bounded local-light
    // volume. It is intentionally unshadowed: tile assignment and the
    // finite catalog distance provide the occlusion boundary, while the
    // generic local-light policy remains strict for every untagged light.
    if (tagged.userData.clusteredLocalLight === true) {
      const source = tagged.userData.clusteredSource;
      if (node instanceof THREE.PointLight
        && Number.isFinite(node.distance)
        && node.distance > 0
        && node.decay === 2
        && typeof source === 'string'
        && source.length > 0) {
        clusteredLocalLights += 1;
      } else {
        violations.push(`${node.name || '(unnamed)'}:invalid-clustered-local-light`);
      }
      return;
    }
    if (tagged.userData.occlusionPolicy === 'shadowed-local' && node.castShadow) shadowedLocalLights += 1;
    else violations.push(`${node.name || '(unnamed)'}:unoccluded-active-light`);
  });
  return { activeLocalLights, shadowedLocalLights, clusteredLocalLights, emissiveOnlySources, violations };
}
