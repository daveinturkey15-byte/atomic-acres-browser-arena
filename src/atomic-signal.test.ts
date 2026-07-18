import { describe, expect, it } from 'vitest';
import { ATOMIC_SIGNAL_FRAGMENT, atomicSignalBypassReason, atomicSignalConfig, atomicSignalTextureSamples, isSoftwareWebGLRenderer } from './atomic-signal';

describe('Atomic Signal profile contract', () => {
  it('keeps compatibility rendering on the direct zero-cost path', () => {
    const config = atomicSignalConfig('compat');
    expect(config.enabled).toBe(false);
    expect(atomicSignalTextureSamples(config)).toBe(0);
  });

  it('uses one texture sample in Performance and bounded clarity taps in Blender Render', () => {
    const performance = atomicSignalConfig('performance');
    const blender = atomicSignalConfig('blender');
    expect(performance.enabled).toBe(true);
    expect(performance.sharpen).toBe(0);
    expect(atomicSignalTextureSamples(performance)).toBe(1);
    expect(blender.enabled).toBe(true);
    expect(blender.sharpen).toBeGreaterThan(0);
    expect(atomicSignalTextureSamples(blender)).toBe(5);
  });

  it('bypasses software renderers by default while preserving explicit QA overrides', () => {
    expect(isSoftwareWebGLRenderer('ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device))')).toBe(true);
    expect(isSoftwareWebGLRenderer('llvmpipe (LLVM 18.1.8, 256 bits)')).toBe(true);
    expect(isSoftwareWebGLRenderer('ANGLE (NVIDIA GeForce RTX 4070 Direct3D11)')).toBe(false);
    expect(atomicSignalBypassReason(null, 'ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device))')).toBe('software-renderer');
    expect(atomicSignalBypassReason(null, 'ANGLE (NVIDIA GeForce RTX 4070 Direct3D11)')).toBeNull();
    expect(atomicSignalBypassReason('on', 'SwiftShader')).toBeNull();
    expect(atomicSignalBypassReason('off', 'NVIDIA GeForce RTX 4070')).toBe('query-disabled');
  });

  it('keeps restrained grade parameters and an ordered no-texture dither', () => {
    for (const profile of ['performance', 'blender'] as const) {
      const config = atomicSignalConfig(profile);
      expect(config.contrast).toBeGreaterThanOrEqual(1);
      expect(config.contrast).toBeLessThanOrEqual(1.05);
      expect(config.saturation).toBeGreaterThanOrEqual(1);
      expect(config.saturation).toBeLessThanOrEqual(1.05);
      expect(config.exposureScale).toBe(1);
      expect(config.vignette).toBeLessThanOrEqual(0.07);
      expect(config.dither).toBeLessThanOrEqual(1);
    }
    expect(ATOMIC_SIGNAL_FRAGMENT).toContain('orderedDither');
    expect(ATOMIC_SIGNAL_FRAGMENT).toContain('atomicAcesFilmicToneMapping');
    expect(ATOMIC_SIGNAL_FRAGMENT).not.toContain('chromatic');
  });
});
