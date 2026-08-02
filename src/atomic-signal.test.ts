import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { ATOMIC_SIGNAL_FRAGMENT, AtomicSignalPass, atomicSignalBypassReason, atomicSignalConfig, atomicSignalEffectsTextureSamples, atomicSignalPrincipalHdrSamples, atomicSignalTextureSamples, isSoftwareWebGLRenderer, renderSceneLayerWithoutBackground, renderSceneOverlayLayer, renderSceneWithoutOverlayLayer, renderSceneWithOverlayLayer } from './atomic-signal';
import { graphicsEffectsBudget } from './graphics-refinement';

function linearChannelToSrgb(channel: number): number {
  return channel < 0.0031308
    ? channel * 12.92
    : 1.055 * channel ** (1 / 2.4) - 0.055;
}

describe('Atomic Signal profile contract', () => {
  it('does not let the sky backdrop overwrite the world during the viewmodel overlay draw', () => {
    const scene = new THREE.Scene();
    const background = new THREE.Texture();
    scene.background = background;
    const camera = new THREE.PerspectiveCamera();
    camera.layers.enable(7);
    const originalMask = camera.layers.mask;
    const draws: Array<{ background: THREE.Scene['background']; layerMask: number; autoClear: boolean }> = [];
    const renderer = {
      autoClear: true,
      clearDepth: () => undefined,
      render: (renderScene: THREE.Scene, renderCamera: THREE.Camera) => {
        draws.push({ background: renderScene.background, layerMask: renderCamera.layers.mask, autoClear: renderer.autoClear });
      },
    };

    renderSceneWithOverlayLayer(renderer, scene, camera, 7);

    expect(draws).toEqual([
      { background, layerMask: 1, autoClear: true },
      { background: null, layerMask: 1 << 7, autoClear: false },
    ]);
    expect(scene.background).toBe(background);
    expect(camera.layers.mask).toBe(originalMask);
    expect(renderer.autoClear).toBe(true);
  });

  it('submits the world once without the overlay and restores the camera mask', () => {
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera();
    camera.layers.enable(7);
    const originalMask = camera.layers.mask;
    const layerMasks: number[] = [];
    const renderer = { render: (_scene: THREE.Scene, renderCamera: THREE.Camera) => layerMasks.push(renderCamera.layers.mask) };

    renderSceneWithoutOverlayLayer(renderer, scene, camera, 7);

    expect(layerMasks).toEqual([1]);
    expect(camera.layers.mask).toBe(originalMask);
  });

  it('clears only depth before a background-free overlay and restores all mutable state', () => {
    const scene = new THREE.Scene();
    const background = new THREE.Texture();
    scene.background = background;
    const camera = new THREE.PerspectiveCamera();
    camera.layers.enable(7);
    const originalMask = camera.layers.mask;
    const calls: string[] = [];
    const renderer = {
      autoClear: true,
      clearDepth: () => calls.push('clear-depth'),
      render: (renderScene: THREE.Scene, renderCamera: THREE.Camera) => {
        calls.push(`render:${renderScene.background === null ? 'no-background' : 'background'}:${renderCamera.layers.mask}:${renderer.autoClear}`);
      },
    };

    renderSceneOverlayLayer(renderer, scene, camera, 7);

    expect(calls).toEqual(['clear-depth', `render:no-background:${1 << 7}:false`]);
    expect(scene.background).toBe(background);
    expect(camera.layers.mask).toBe(originalMask);
    expect(renderer.autoClear).toBe(true);
  });

  it('does not admit the sky backdrop into the selective-bloom layer', () => {
    const scene = new THREE.Scene();
    const background = new THREE.Texture();
    scene.background = background;
    const camera = new THREE.PerspectiveCamera();
    camera.layers.enable(7);
    const originalMask = camera.layers.mask;
    const draws: Array<{ background: THREE.Scene['background']; layerMask: number }> = [];
    const renderer = {
      render: (renderScene: THREE.Scene, renderCamera: THREE.Camera) => {
        draws.push({ background: renderScene.background, layerMask: renderCamera.layers.mask });
      },
    };

    renderSceneLayerWithoutBackground(renderer, scene, camera, 13);

    expect(draws).toEqual([{ background: null, layerMask: 1 << 13 }]);
    expect(scene.background).toBe(background);
    expect(camera.layers.mask).toBe(originalMask);
  });

  it('retains the first-person overlay when the post pass takes its direct fallback', () => {
    const scene = new THREE.Scene();
    const background = new THREE.Texture();
    scene.background = background;
    const camera = new THREE.PerspectiveCamera();
    camera.layers.enable(7);
    const draws: Array<{ background: THREE.Scene['background']; layerMask: number }> = [];
    const renderer = {
      autoClear: true,
      toneMapping: THREE.ACESFilmicToneMapping,
      toneMappingExposure: 1,
      capabilities: { maxSamples: 8 },
      info: { autoReset: true, reset: () => undefined },
      getContext: () => ({
        SAMPLES: 0x80a9,
        getContextAttributes: () => ({ antialias: true }),
        getParameter: () => 4,
      }),
      setRenderTarget: () => undefined,
      clearDepth: () => undefined,
      render: (renderScene: THREE.Scene, renderCamera: THREE.Camera) => {
        draws.push({ background: renderScene.background, layerMask: renderCamera.layers.mask });
      },
    } as unknown as THREE.WebGLRenderer;
    const pass = new AtomicSignalPass(renderer, 'compat');

    pass.render(scene, camera, 7);

    expect(draws).toEqual([
      { background, layerMask: 1 },
      { background: null, layerMask: 1 << 7 },
    ]);
    expect(scene.background).toBe(background);
    expect(renderer.toneMapping).toBe(THREE.ACESFilmicToneMapping);
  });

  it('keeps compatibility rendering on the direct zero-cost path', () => {
    const config = atomicSignalConfig('compat');
    expect(config.enabled).toBe(false);
    expect(atomicSignalTextureSamples(config)).toBe(0);
  });

  it('uses one texture sample in Performance and bounded clarity taps in Quality Graphics', () => {
    const performance = atomicSignalConfig('performance');
    const blender = atomicSignalConfig('blender');
    expect(performance.enabled).toBe(true);
    expect(performance.sharpen).toBe(0);
    expect(atomicSignalTextureSamples(performance)).toBe(1);
    expect(blender.enabled).toBe(true);
    expect(blender.sharpen).toBeGreaterThan(0);
    expect(atomicSignalTextureSamples(blender)).toBe(5);
  });

  it('multisamples the principal HDR scene target independently of canvas and bloom targets', () => {
    expect(atomicSignalPrincipalHdrSamples('blender', 8)).toBe(4);
    expect(atomicSignalPrincipalHdrSamples('performance', 8)).toBe(2);
    expect(atomicSignalPrincipalHdrSamples('blender', 2)).toBe(2);
    expect(atomicSignalPrincipalHdrSamples('compat', 8)).toBe(0);
  });

  it('bypasses software renderers by default while preserving explicit QA overrides', () => {
    expect(isSoftwareWebGLRenderer('ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device))')).toBe(true);
    expect(isSoftwareWebGLRenderer('llvmpipe (LLVM 18.1.8, 256 bits)')).toBe(true);
    expect(isSoftwareWebGLRenderer('ANGLE (Microsoft, Microsoft Basic Render Driver Direct3D11)')).toBe(true);
    expect(isSoftwareWebGLRenderer('ANGLE (Microsoft, WARP Direct3D11)')).toBe(true);
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
    const toneMap = ATOMIC_SIGNAL_FRAGMENT.indexOf('color = atomicAcesFilmicToneMapping(color);');
    const outputTransfer = ATOMIC_SIGNAL_FRAGMENT.indexOf('color = linearToSrgb(color);');
    const displayLuma = ATOMIC_SIGNAL_FRAGMENT.indexOf('float luma = luminance(color);');
    const displayContrast = ATOMIC_SIGNAL_FRAGMENT.indexOf('color = (color - 0.5) * contrast + 0.5;');
    const finalClamp = ATOMIC_SIGNAL_FRAGMENT.indexOf('vec3 encoded = clamp(color, 0.0, 1.0);');
    const dither = ATOMIC_SIGNAL_FRAGMENT.indexOf('encoded += (orderedDither');
    expect(toneMap).toBeGreaterThan(-1);
    expect(outputTransfer).toBeGreaterThan(toneMap);
    expect(displayLuma).toBeGreaterThan(outputTransfer);
    expect(displayContrast).toBeGreaterThan(displayLuma);
    expect(finalClamp).toBeGreaterThan(displayContrast);
    expect(dither).toBeGreaterThan(finalClamp);
    expect(ATOMIC_SIGNAL_FRAGMENT).not.toContain('linearToSrgb(clamp(color');
    expect(ATOMIC_SIGNAL_FRAGMENT).not.toContain('chromatic');
  });

  it('retains readable display luminance for the measured Gun Range shadow floor', () => {
    // The black-room reproduction measured valid tone-mapped linear shadows at
    // roughly 0.006. A 0.5 contrast pivot in linear space makes that negative;
    // the display-referred order preserves a visible 8-bit floor instead.
    const measuredToneMappedShadow = 0.006;
    const config = atomicSignalConfig('blender');
    const legacyLinearGrade = (measuredToneMappedShadow - 0.5) * config.contrast + 0.5;
    const displayGrade = (linearChannelToSrgb(measuredToneMappedShadow) - 0.5) * config.contrast + 0.5;

    expect(legacyLinearGrade).toBeLessThan(0);
    expect(Math.round(Math.max(0, displayGrade) * 255)).toBeGreaterThanOrEqual(12);
  });

  it('bounds Pass 62 depth and selective-emissive sampling by effect tier', () => {
    const config = atomicSignalConfig('blender');
    const full = graphicsEffectsBudget('blender', 1);
    const low = graphicsEffectsBudget('blender', 0.65);
    expect(atomicSignalEffectsTextureSamples(config, full)).toBeGreaterThan(atomicSignalEffectsTextureSamples(config, low));
    expect(ATOMIC_SIGNAL_FRAGMENT).toContain('contactOcclusion');
    expect(ATOMIC_SIGNAL_FRAGMENT).toContain('selectiveBloom');
    expect(ATOMIC_SIGNAL_FRAGMENT).toContain('worldPositionFromDepth');
    expect(ATOMIC_SIGNAL_FRAGMENT).toContain('float sceneSampleDepth = texture2D(tDepth, uv).x');
    expect(ATOMIC_SIGNAL_FRAGMENT).toContain('step(bloomDepth, sceneSampleDepth + 0.0025)');
    expect(ATOMIC_SIGNAL_FRAGMENT).not.toContain('step(bloomDepth, centreDepth + 0.0025)');
  });
});
