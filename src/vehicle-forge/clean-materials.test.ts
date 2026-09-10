import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { createForgePaintMaterial, createForgeChromeMaterial, createForgeGlassMaterial } from './materials';
import { createForgeMaterialSet } from './build';

describe('clean vehicle material boundaries', () => {
  it('keeps solid painted panels fully opaque with a separate smooth coat', () => {
    for (const color of [0x173451, 0x621821, 0xf4eee0]) {
      const paint = createForgePaintMaterial({ name: 'clean-proof', color });
      expect(paint.transparent).toBe(false);
      expect(paint.opacity).toBe(1);
      expect(paint.depthWrite).toBe(true);
      expect(paint.transmission).toBe(0);
      expect(paint.side).toBe(THREE.FrontSide);
      expect(paint.metalness).toBe(0);
      expect(paint.specularIntensity).toBe(1);
      expect(paint.color.getHex(THREE.SRGBColorSpace)).toBe(color);
      expect(paint.colorNode).toMatchObject({ isUniformNode: true });
      expect(paint.clearcoat).toBe(0.8);
      expect(paint.clearcoatRoughness).toBe(0.16);
      expect(paint.emissive.getHex()).toBe(0);
      expect(paint.emissiveNode).toBeNull();
    }
  });

  it('respects explicit coat settings and retains a deliberate weathered finish', () => {
    const clean = createForgePaintMaterial({ name: 'coat', color: 0x173451, clearcoat: 0.4, clearcoatRoughness: 0.23 });
    expect(clean.clearcoat).toBe(0.4);
    expect(clean.clearcoatRoughness).toBe(0.23);
    const worn = createForgePaintMaterial({ name: 'worn', color: 0x173451, finish: 'weathered' });
    expect(worn.userData.forgeFinish).toBe('weathered');
    expect(worn.specularIntensity).toBe(0.08);
    expect(worn.colorNode).not.toMatchObject({ isUniformNode: true });
  });

  it('gives clean chrome environmental reflection without glowing or dirt overlays', () => {
    const chrome = createForgeChromeMaterial();
    expect(chrome.metalness).toBe(1);
    expect(chrome.roughness).toBe(0.09);
    expect(chrome.colorNode).toBeNull();
    expect(chrome.emissiveNode).toBeNull();
    expect(chrome.emissive.getHex()).toBe(0);
    expect(createForgeChromeMaterial(true).normalNode).not.toBeNull();
  });

  it('mirrors window tint and useful opacity into the compatibility path', () => {
    const glass = createForgeGlassMaterial('tint-proof', 0x243036);
    expect(glass.color.getHex(THREE.SRGBColorSpace)).toBe(0x243036);
    expect(glass.opacity).toBe(0.52);
    expect(glass.transmission).toBe(0);
    expect(glass.envMap).toBeNull(); // scene environment remains the shared source
    expect(glass.emissiveNode).toBeNull();
    expect(glass.emissive.getHex()).toBe(0);
  });

  it('keeps alpha blending exclusively in the glass bucket', () => {
    const materials = createForgeMaterialSet(0x173451, 'bucket-proof');
    expect(materials.paint).toMatchObject({ roughness: 0.2 });
    expect(materials.accent).toMatchObject({ roughness: 0.2 });
    expect(Object.entries(materials).filter(([, material]) => material.transparent).map(([bucket]) => bucket)).toEqual(['glass']);
    expect(Object.values(materials)).toHaveLength(9);
  });
});
