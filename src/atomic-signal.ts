import * as THREE from 'three';
import type { RenderProfile } from './render-profile';

export type AtomicSignalConfig = {
  enabled: boolean;
  profile: RenderProfile;
  contrast: number;
  saturation: number;
  exposureScale: number;
  sharpen: number;
  vignette: number;
  dither: number;
  shadowTint: readonly [number, number, number];
  highlightTint: readonly [number, number, number];
};

export type AtomicSignalTelemetry = {
  enabled: boolean;
  profile: RenderProfile;
  fallbackReason: string | null;
  bypassReason: string | null;
  passCpuMs: number;
  averagePassCpuMs: number;
  samples: number;
  textureSamples: number;
  targetValidated: boolean;
  outputValidated: boolean;
  width: number;
  height: number;
};

const FULLSCREEN_VERTEX = /* glsl */`
  precision highp float;
  attribute vec3 position;
  attribute vec2 uv;
  varying vec2 vUv;

  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

export const ATOMIC_SIGNAL_FRAGMENT = /* glsl */`
  precision highp float;
  uniform sampler2D tDiffuse;
  uniform vec2 inverseResolution;
  uniform float signalExposure;
  uniform float contrast;
  uniform float saturation;
  uniform float sharpen;
  uniform float vignette;
  uniform float dither;
  uniform vec3 shadowTint;
  uniform vec3 highlightTint;
  varying vec2 vUv;

  // Compact filmic curve and transfer function keep this pass independent of
  // Three.js' renderer-injected tone-mapping uniforms (which RawShaderMaterial
  // also receives) and therefore avoid duplicate shader declarations.
  vec3 atomicRrtAndOdtFit(vec3 value) {
    vec3 a = value * (value + 0.0245786) - 0.000090537;
    vec3 b = value * (0.983729 * value + 0.4329510) + 0.238081;
    return a / b;
  }

  vec3 atomicAcesFilmicToneMapping(vec3 color) {
    const mat3 inputMatrix = mat3(
      vec3(0.59719, 0.07600, 0.02840),
      vec3(0.35458, 0.90834, 0.13383),
      vec3(0.04823, 0.01566, 0.83777)
    );
    const mat3 outputMatrix = mat3(
      vec3(1.60475, -0.10208, -0.00327),
      vec3(-0.53108, 1.10813, -0.07276),
      vec3(-0.07367, -0.00605, 1.07602)
    );
    color *= signalExposure / 0.6;
    color = inputMatrix * color;
    color = atomicRrtAndOdtFit(color);
    color = outputMatrix * color;
    return clamp(color, 0.0, 1.0);
  }

  vec3 linearToSrgb(vec3 color) {
    vec3 lower = color * 12.92;
    vec3 higher = 1.055 * pow(max(color, vec3(0.0)), vec3(1.0 / 2.4)) - 0.055;
    return mix(lower, higher, step(vec3(0.0031308), color));
  }

  float luminance(vec3 color) {
    return dot(color, vec3(0.2126, 0.7152, 0.0722));
  }

  // A stable 4x4 ordered pattern removes visible 8-bit bands without temporal
  // grain shimmer or another sampled texture.
  float orderedDither(vec2 pixel) {
    vec2 cell = mod(floor(pixel), 4.0);
    float index = cell.x + cell.y * 4.0;
    if (index < 0.5) return 0.0 / 16.0;
    if (index < 1.5) return 8.0 / 16.0;
    if (index < 2.5) return 2.0 / 16.0;
    if (index < 3.5) return 10.0 / 16.0;
    if (index < 4.5) return 12.0 / 16.0;
    if (index < 5.5) return 4.0 / 16.0;
    if (index < 6.5) return 14.0 / 16.0;
    if (index < 7.5) return 6.0 / 16.0;
    if (index < 8.5) return 3.0 / 16.0;
    if (index < 9.5) return 11.0 / 16.0;
    if (index < 10.5) return 1.0 / 16.0;
    if (index < 11.5) return 9.0 / 16.0;
    if (index < 12.5) return 15.0 / 16.0;
    if (index < 13.5) return 7.0 / 16.0;
    if (index < 14.5) return 13.0 / 16.0;
    return 5.0 / 16.0;
  }

  vec3 sampleLinear(vec2 uv) {
    return texture2D(tDiffuse, clamp(uv, vec2(0.0), vec2(1.0))).rgb;
  }

  void main() {
    vec3 color = sampleLinear(vUv);

    // Quality Graphics gets a restrained four-neighbour clarity pass. Performance
    // sets sharpen to zero, so uniform branching avoids the extra samples.
    if (sharpen > 0.0001) {
      vec3 neighbours = sampleLinear(vUv + vec2(inverseResolution.x, 0.0))
        + sampleLinear(vUv - vec2(inverseResolution.x, 0.0))
        + sampleLinear(vUv + vec2(0.0, inverseResolution.y))
        + sampleLinear(vUv - vec2(0.0, inverseResolution.y));
      color += (color - neighbours * 0.25) * sharpen;
    }

    color = max(color, vec3(0.0));
    color = atomicAcesFilmicToneMapping(color);

    float luma = luminance(color);
    color = mix(vec3(luma), color, saturation);
    color = (color - 0.5) * contrast + 0.5;

    float shadowWeight = 1.0 - smoothstep(0.10, 0.52, luma);
    float highlightWeight = smoothstep(0.48, 0.95, luma);
    color += shadowTint * shadowWeight;
    color += highlightTint * highlightWeight;

    vec2 centered = vUv * 2.0 - 1.0;
    float edge = smoothstep(0.32, 1.30, dot(centered, centered));
    color *= 1.0 - edge * vignette;

    vec3 encoded = linearToSrgb(clamp(color, 0.0, 1.0));
    encoded += (orderedDither(gl_FragCoord.xy) - 0.46875) * (dither / 255.0);
    gl_FragColor = vec4(clamp(encoded, 0.0, 1.0), 1.0);
  }
`;

export function isSoftwareWebGLRenderer(rendererLabel: string): boolean {
  return /swiftshader|llvmpipe|software|softpipe|\bwarp\b|microsoft basic render driver/i.test(rendererLabel);
}

export function atomicSignalBypassReason(signalQuery: string | null, rendererLabel: string): string | null {
  if (signalQuery === 'off') return 'query-disabled';
  if (signalQuery === 'on') return null;
  return isSoftwareWebGLRenderer(rendererLabel) ? 'software-renderer' : null;
}

export function atomicSignalConfig(profile: RenderProfile): AtomicSignalConfig {
  if (profile === 'compat') {
    return {
      enabled: false,
      profile,
      contrast: 1,
      saturation: 1,
      exposureScale: 1,
      sharpen: 0,
      vignette: 0,
      dither: 0,
      shadowTint: [0, 0, 0],
      highlightTint: [0, 0, 0],
    };
  }
  if (profile === 'performance') {
    return {
      enabled: true,
      profile,
      contrast: 1.025,
      saturation: 1.03,
      exposureScale: 1,
      sharpen: 0,
      vignette: 0.055,
      dither: 0.85,
      shadowTint: [-0.004, 0.006, 0.008],
      highlightTint: [0.007, 0.003, -0.002],
    };
  }
  return {
    enabled: true,
    profile,
    contrast: 1.035,
    saturation: 1.04,
    exposureScale: 1,
    sharpen: 0.12,
    vignette: 0.065,
    dither: 0.75,
    shadowTint: [-0.005, 0.008, 0.011],
    highlightTint: [0.009, 0.004, -0.002],
  };
}

export function atomicSignalTextureSamples(config: AtomicSignalConfig): number {
  if (!config.enabled) return 0;
  return config.sharpen > 0 ? 5 : 1;
}

export class AtomicSignalPass {
  private readonly config: AtomicSignalConfig;
  private readonly screenToneMapping: THREE.ToneMapping;
  private readonly target: THREE.WebGLRenderTarget | null;
  private readonly material: THREE.RawShaderMaterial | null;
  private readonly quadScene = new THREE.Scene();
  private readonly quadCamera = new THREE.Camera();
  private readonly bypassReason: string | null;
  private fallbackReason: string | null = null;
  private targetValidated = false;
  private outputValidated = false;
  private passCpuMs = 0;
  private averagePassCpuMs = 0;
  private samples = 0;
  private width = 1;
  private height = 1;

  constructor(
    private readonly renderer: THREE.WebGLRenderer,
    profile: RenderProfile,
    private readonly onFallback?: (reason: string) => void,
    bypassReason: string | null = null,
  ) {
    this.screenToneMapping = renderer.toneMapping;
    const configured = atomicSignalConfig(profile);
    this.bypassReason = configured.enabled ? bypassReason : 'compat-profile';
    this.config = this.bypassReason ? { ...configured, enabled: false, sharpen: 0, vignette: 0, dither: 0 } : configured;
    renderer.info.autoReset = false;
    if (!this.config.enabled) {
      this.target = null;
      this.material = null;
      return;
    }
    // The HDR scene target must remain linear. Atomic Signal owns the one and
    // only filmic/output transform for enabled profiles.
    renderer.toneMapping = THREE.NoToneMapping;

    this.target = new THREE.WebGLRenderTarget(1, 1, {
      type: THREE.HalfFloatType,
      depthBuffer: true,
      stencilBuffer: false,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      generateMipmaps: false,
    });
    this.target.texture.name = `AtomicSignal.${profile}.hdr`;

    this.material = new THREE.RawShaderMaterial({
      name: `Atomic Signal ${profile}`,
      vertexShader: FULLSCREEN_VERTEX,
      fragmentShader: ATOMIC_SIGNAL_FRAGMENT,
      uniforms: {
        tDiffuse: { value: this.target.texture },
        inverseResolution: { value: new THREE.Vector2(1, 1) },
        signalExposure: { value: renderer.toneMappingExposure * this.config.exposureScale },
        contrast: { value: this.config.contrast },
        saturation: { value: this.config.saturation },
        sharpen: { value: this.config.sharpen },
        vignette: { value: this.config.vignette },
        dither: { value: this.config.dither },
        shadowTint: { value: new THREE.Vector3(...this.config.shadowTint) },
        highlightTint: { value: new THREE.Vector3(...this.config.highlightTint) },
      },
      depthTest: false,
      depthWrite: false,
      blending: THREE.NoBlending,
      transparent: false,
      toneMapped: false,
    });
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.material);
    quad.name = 'atomic-signal-fullscreen-triangle';
    quad.frustumCulled = false;
    this.quadScene.add(quad);
  }

  resize(): void {
    if (!this.target || !this.material) return;
    const size = this.renderer.getDrawingBufferSize(new THREE.Vector2());
    const width = Math.max(1, Math.floor(size.x));
    const height = Math.max(1, Math.floor(size.y));
    if (width === this.width && height === this.height) return;
    this.width = width;
    this.height = height;
    this.target.setSize(width, height);
    (this.material.uniforms.inverseResolution.value as THREE.Vector2).set(1 / width, 1 / height);
  }

  invalidateValidation(): void {
    if (!this.config.enabled || this.fallbackReason) return;
    this.targetValidated = false;
    this.outputValidated = false;
  }

  private renderDirect(scene: THREE.Scene, camera: THREE.Camera): void {
    const previousToneMapping = this.renderer.toneMapping;
    this.renderer.toneMapping = this.screenToneMapping;
    this.renderer.setRenderTarget(null);
    this.renderer.render(scene, camera);
    this.renderer.toneMapping = previousToneMapping;
  }

  private validateBoundTarget(): void {
    if (this.targetValidated) return;
    const gl = this.renderer.getContext();
    if (gl.isContextLost()) return;
    const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
    if (status !== gl.FRAMEBUFFER_COMPLETE) {
      throw new Error(`Atomic Signal framebuffer incomplete (${status})`);
    }
    this.targetValidated = true;
  }

  private validateOutput(): void {
    if (this.outputValidated) return;
    const gl = this.renderer.getContext();
    if (gl.isContextLost()) return;
    const width = gl.drawingBufferWidth;
    const height = gl.drawingBufferHeight;
    if (width < 2 || height < 2) return;
    const pixel = new Uint8Array(4);
    const probes = [
      [Math.floor(width * 0.5), Math.floor(height * 0.5)],
      [Math.floor(width * 0.75), Math.floor(height * 0.5)],
      [Math.floor(width * 0.5), Math.floor(height * 0.75)],
    ];
    for (const [x, y] of probes) {
      gl.readPixels(x, y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
      if (pixel[0] + pixel[1] + pixel[2] > 3) {
        this.outputValidated = true;
        return;
      }
    }
    throw new Error('Atomic Signal produced an all-black validation frame');
  }

  render(scene: THREE.Scene, camera: THREE.Camera): void {
    this.renderer.info.reset();
    if (!this.target || !this.material || this.fallbackReason) {
      this.renderDirect(scene, camera);
      return;
    }

    try {
      (this.material.uniforms.signalExposure as { value: number }).value = this.renderer.toneMappingExposure * this.config.exposureScale;
      this.renderer.setRenderTarget(this.target);
      this.validateBoundTarget();
      this.renderer.clear();
      this.renderer.render(scene, camera);
      this.renderer.setRenderTarget(null);
      const passStarted = performance.now();
      this.renderer.render(this.quadScene, this.quadCamera);
      this.validateOutput();
      this.passCpuMs = Math.max(0, performance.now() - passStarted);
      this.samples += 1;
      if (this.samples === 1) this.averagePassCpuMs = 0;
      else if (this.samples === 2) this.averagePassCpuMs = this.passCpuMs;
      else this.averagePassCpuMs += (this.passCpuMs - this.averagePassCpuMs) / Math.min(this.samples - 1, 120);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.fallbackReason = message || 'post-processing render failed';
      this.onFallback?.(this.fallbackReason);
      this.renderDirect(scene, camera);
    }
  }

  telemetry(): AtomicSignalTelemetry {
    const active = this.config.enabled && this.fallbackReason === null;
    return {
      enabled: active,
      profile: this.config.profile,
      fallbackReason: this.fallbackReason,
      bypassReason: this.bypassReason,
      passCpuMs: active ? this.passCpuMs : 0,
      averagePassCpuMs: active ? this.averagePassCpuMs : 0,
      samples: active ? this.samples : 0,
      textureSamples: active ? atomicSignalTextureSamples(this.config) : 0,
      targetValidated: active && this.targetValidated,
      outputValidated: active && this.outputValidated,
      width: this.width,
      height: this.height,
    };
  }

  dispose(): void {
    if (this.config.enabled) this.renderer.toneMapping = this.screenToneMapping;
    this.target?.dispose();
    this.material?.dispose();
    const quad = this.quadScene.children[0];
    if (quad instanceof THREE.Mesh) quad.geometry.dispose();
  }
}
