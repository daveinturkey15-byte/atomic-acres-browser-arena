export type WebGlShadowSamplerMode = 'pcf-compare' | 'basic-depth';

/**
 * Three r185's PCF path binds depth-comparison sampler arrays. WebKit/Safari's
 * WebGL2 implementation and software WebGL adapters reject that array during
 * real multi-spotlight draws with a texture-format/sampler-type mismatch. Basic
 * shadows retain real depth occlusion while using ordinary depth samplers.
 */
export function webGlShadowSamplerMode(
  userAgent: string,
  softwareWebGlRenderer: boolean,
): WebGlShadowSamplerMode {
  const webkitEngine = /AppleWebKit\//i.test(userAgent);
  const chromiumEngine = /(?:Chrome|Chromium|Edg|OPR)\//i.test(userAgent);
  return softwareWebGlRenderer || (webkitEngine && !chromiumEngine) ? 'basic-depth' : 'pcf-compare';
}
