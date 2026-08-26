import { describe, expect, it } from 'vitest';
import { renderProfileConfig, resolveRenderProfile } from './render-profile';

describe('render profiles', () => {
  it('defaults new players to the highest-quality Quality Graphics profile', () => {
    expect(resolveRenderProfile('', null)).toBe('blender');
    expect(renderProfileConfig('blender')).toMatchObject({
      representation: 'blender',
      reducedRepresentation: false,
      reducedWorldDetail: false,
      reducedPresentationDetail: false,
      staticMaterialMode: 'preserve',
      antialias: true,
      shadows: true,
      shadowMode: 'static',
      pixelRatioCap: 1,
    });
  });

  it('allows Quality Graphics and compatibility overrides while migrating legacy Quality', () => {
    expect(resolveRenderProfile('?render=quality', 'compat')).toBe('blender');
    expect(resolveRenderProfile('?render=blender', 'performance')).toBe('blender');
    expect(resolveRenderProfile('?render=compat', 'blender')).toBe('compat');
    expect(resolveRenderProfile('?render=performance', 'blender')).toBe('performance');
    expect(resolveRenderProfile('?render=balanced', null)).toBe('performance');
    expect(renderProfileConfig('blender')).toMatchObject({
      representation: 'blender', reducedRepresentation: false, reducedWorldDetail: false,
      reducedPresentationDetail: false, staticMaterialMode: 'preserve', antialias: true,
      shadows: true, shadowMode: 'static', pixelRatioCap: 1, shadowMapSize: 2048,
    });
    expect(renderProfileConfig('compat').reducedRepresentation).toBe(true);
  });

  it('uses valid stored preferences, keeps compat query-only, and rejects unknown labels', () => {
    expect(resolveRenderProfile('', 'performance')).toBe('performance');
    expect(resolveRenderProfile('', 'quality')).toBe('blender');
    expect(resolveRenderProfile('', 'blender')).toBe('blender');
    expect(resolveRenderProfile('', 'balanced')).toBe('performance');
    expect(resolveRenderProfile('', 'compat')).toBe('blender');
    expect(resolveRenderProfile('', 'ultra')).toBe('blender');
    expect(resolveRenderProfile('?render=unknown', 'compat')).toBe('blender');
  });
});
