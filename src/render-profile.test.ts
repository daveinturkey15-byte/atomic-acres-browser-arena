import { describe, expect, it } from 'vitest';
import { renderProfileConfig, resolveRenderProfile } from './render-profile';

describe('render profiles', () => {
  it('defaults to the responsive original-art profile', () => {
    expect(resolveRenderProfile('', null)).toBe('performance');
    expect(renderProfileConfig('performance')).toMatchObject({
      representation: 'responsive',
      reducedRepresentation: true,
      reducedWorldDetail: true,
      reducedPresentationDetail: true,
      staticMaterialMode: 'palette-basic',
      antialias: false,
      shadows: false,
      shadowMode: 'off',
      pixelRatioCap: 0.75,
    });
  });

  it('allows explicit quality and compatibility overrides', () => {
    expect(resolveRenderProfile('?render=quality', 'compat')).toBe('quality');
    expect(resolveRenderProfile('?render=compat', 'quality')).toBe('compat');
    expect(resolveRenderProfile('?render=performance', 'quality')).toBe('performance');
    expect(resolveRenderProfile('?render=balanced', null)).toBe('performance');
    expect(renderProfileConfig('quality')).toMatchObject({
      staticMaterialMode: 'texture-lit', shadows: false, shadowMode: 'off', pixelRatioCap: 1,
    });
    expect(renderProfileConfig('compat').reducedRepresentation).toBe(true);
  });

  it('uses valid stored preferences and rejects unknown labels', () => {
    expect(resolveRenderProfile('', 'quality')).toBe('quality');
    expect(resolveRenderProfile('', 'balanced')).toBe('performance');
    expect(resolveRenderProfile('', 'ultra')).toBe('performance');
    expect(resolveRenderProfile('?render=unknown', 'compat')).toBe('compat');
  });
});
