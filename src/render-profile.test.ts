import { describe, expect, it } from 'vitest';
import { renderProfileConfig, resolveRenderProfile } from './render-profile';

describe('render profiles', () => {
  it('defaults to the responsive original-art profile', () => {
    expect(resolveRenderProfile('', null)).toBe('balanced');
    expect(renderProfileConfig('balanced')).toMatchObject({
      representation: 'responsive',
      reducedRepresentation: true,
      reducedWorldDetail: true,
      reducedPresentationDetail: true,
      staticMaterialMode: 'palette-basic',
      shadows: false,
      shadowMode: 'off',
      pixelRatioCap: 0.85,
    });
  });

  it('allows explicit quality and compatibility overrides', () => {
    expect(resolveRenderProfile('?render=quality', 'compat')).toBe('quality');
    expect(resolveRenderProfile('?render=compat', 'quality')).toBe('compat');
    expect(resolveRenderProfile('?render=performance', 'quality')).toBe('balanced');
    expect(renderProfileConfig('quality').shadows).toBe(true);
    expect(renderProfileConfig('compat').reducedRepresentation).toBe(true);
  });

  it('uses valid stored preferences and rejects unknown labels', () => {
    expect(resolveRenderProfile('', 'quality')).toBe('quality');
    expect(resolveRenderProfile('', 'ultra')).toBe('balanced');
    expect(resolveRenderProfile('?render=unknown', 'compat')).toBe('compat');
  });
});
