import { describe, expect, it } from 'vitest';
import { webGlShadowSamplerMode } from './webgl-shadow-compatibility';

describe('WebGL shadow sampler browser compatibility', () => {
  it.each([
    ['desktop Safari', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/18.5 Safari/605.1.15'],
    ['Playwright WebKit on Windows', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/605.1.15 Version/18.0 Safari/605.1.15'],
    ['iOS Chrome (still WebKit)', 'Mozilla/5.0 (iPhone) AppleWebKit/605.1.15 CriOS/138.0 Mobile/15E148 Safari/604.1'],
  ])('keeps real basic-depth shadows on %s', (_label, userAgent) => {
    expect(webGlShadowSamplerMode(userAgent)).toBe('basic-depth');
  });

  it.each([
    ['Chrome', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/151.0.0.0 Safari/537.36'],
    ['Edge', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/151.0.0.0 Safari/537.36 Edg/151.0.0.0'],
    ['Firefox', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:153.0) Gecko/20100101 Firefox/153.0'],
  ])('retains filtered PCF comparison shadows on %s', (_label, userAgent) => {
    expect(webGlShadowSamplerMode(userAgent)).toBe('pcf-compare');
  });

  // Pass 74 soft tier. `light.shadow.radius` is read only by PCFSoftShadowMap,
  // so the penumbra the arenas author (farcrysis sun radius 7, contrast
  // lighting 1.5-2.2) was previously discarded on every profile.
  const chrome = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/151.0.0.0 Safari/537.36';
  const safari = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/18.5 Safari/605.1.15';

  it('honours the authored penumbra on the quality profile', () => {
    expect(webGlShadowSamplerMode(chrome, 'blender')).toBe('pcf-soft');
  });

  it('keeps the cheaper sampler on performance and compat', () => {
    expect(webGlShadowSamplerMode(chrome, 'performance')).toBe('pcf-compare');
    expect(webGlShadowSamplerMode(chrome, 'compat')).toBe('pcf-compare');
  });

  it('never overrides the WebKit compatibility floor, quality included', () => {
    // The sampler-array defect is an engine limit, not a quality choice.
    expect(webGlShadowSamplerMode(safari, 'blender')).toBe('basic-depth');
  });

  it('defaults to the cheaper sampler when no profile is supplied', () => {
    expect(webGlShadowSamplerMode(chrome)).toBe('pcf-compare');
  });
});
