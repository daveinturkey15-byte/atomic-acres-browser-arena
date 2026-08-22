export type WebGlShadowSamplerMode = 'pcf-soft' | 'pcf-compare' | 'basic-depth';

/**
 * Three r185's PCF path binds depth-comparison sampler arrays. WebKit/Safari's
 * WebGL2 implementation rejects that array during real multi-spotlight draws
 * with a texture-format/sampler-type mismatch. Basic shadows retain real depth
 * occlusion while using ordinary depth samplers on that engine family.
 *
 * Soft tier (Pass 74): `light.shadow.radius` is only honoured by
 * PCFSoftShadowMap - plain PCF ignores it. The arenas already author a
 * penumbra expecting it (farcrysis-terrain.ts sets `sun.shadow.radius = 7`
 * with a comment saying it needs PCFSoftShadowMap, and the contrast-lighting
 * pass sets 1.5-2.2), so on the quality profile that authored softness was
 * simply being discarded. Selecting the soft sampler there makes the authored
 * value real. It stays off on the performance/compat profiles, where the extra
 * taps are not affordable, and off on WebKit for the reason above.
 *
 * This is presentation only: shadow softness changes no collision, no
 * visibility authority and no gameplay value.
 */
export function webGlShadowSamplerMode(
  userAgent: string,
  profile: 'blender' | 'performance' | 'compat' = 'performance',
): WebGlShadowSamplerMode {
  const webkitEngine = /AppleWebKit\//i.test(userAgent);
  const chromiumEngine = /(?:Chrome|Chromium|Edg|OPR)\//i.test(userAgent);
  if (webkitEngine && !chromiumEngine) return 'basic-depth';
  return profile === 'blender' ? 'pcf-soft' : 'pcf-compare';
}
