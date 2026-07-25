import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { auditLocalLightOcclusion, makeEmissiveOnly, makeShadowedLocal } from './light-occlusion';

describe('Pass 64 local-light occlusion policy', () => {
  it('rejects active unshadowed local lights and accepts shadowed or emissive-only sources', () => {
    const root = new THREE.Group();
    const leaking = new THREE.PointLight(0xffffff, 1, 10);
    leaking.name = 'leaking';
    root.add(leaking);
    expect(auditLocalLightOcclusion(root).violations).toEqual(['leaking:unoccluded-active-light']);
    makeShadowedLocal(leaking);
    expect(auditLocalLightOcclusion(root)).toMatchObject({ activeLocalLights: 1, shadowedLocalLights: 1, violations: [] });
    makeEmissiveOnly(leaking);
    expect(auditLocalLightOcclusion(root)).toMatchObject({ activeLocalLights: 0, emissiveOnlySources: 1, violations: [] });
  });
});
