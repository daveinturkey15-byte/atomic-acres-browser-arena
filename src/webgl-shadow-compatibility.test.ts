import { describe, expect, it } from 'vitest';
import { webGlShadowSamplerMode } from './webgl-shadow-compatibility';

describe('WebGL shadow sampler browser compatibility', () => {
  it.each([
    ['desktop Safari', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/18.5 Safari/605.1.15'],
    ['Playwright WebKit on Windows', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/605.1.15 Version/18.0 Safari/605.1.15'],
    ['iOS Chrome (still WebKit)', 'Mozilla/5.0 (iPhone) AppleWebKit/605.1.15 CriOS/138.0 Mobile/15E148 Safari/604.1'],
  ])('keeps real basic-depth shadows on %s', (_label, userAgent) => {
    expect(webGlShadowSamplerMode(userAgent, false)).toBe('basic-depth');
  });

  it.each([
    ['SwiftShader Chromium', 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/149.0.0.0 Safari/537.36'],
    ['llvmpipe Firefox', 'Mozilla/5.0 (X11; Linux x86_64; rv:153.0) Gecko/20100101 Firefox/153.0'],
  ])('keeps real basic-depth shadows on software WebGL under %s', (_label, userAgent) => {
    expect(webGlShadowSamplerMode(userAgent, true)).toBe('basic-depth');
  });

  it.each([
    ['Chrome', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/151.0.0.0 Safari/537.36'],
    ['Edge', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/151.0.0.0 Safari/537.36 Edg/151.0.0.0'],
    ['Firefox', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:153.0) Gecko/20100101 Firefox/153.0'],
  ])('retains filtered PCF comparison shadows on %s', (_label, userAgent) => {
    expect(webGlShadowSamplerMode(userAgent, false)).toBe('pcf-compare');
  });
});
