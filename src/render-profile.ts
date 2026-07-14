export type RenderProfile = 'performance' | 'quality' | 'compat';

export const RENDER_PROFILE_STORAGE_KEY = 'atomic-acres-render-profile';

export type RenderProfileConfig = {
  profile: RenderProfile;
  representation: 'responsive' | 'full' | 'compat';
  reducedRepresentation: boolean;
  reducedWorldDetail: boolean;
  reducedPresentationDetail: boolean;
  staticMaterialMode: 'preserve' | 'texture-lit' | 'palette-lit' | 'palette-basic';
  antialias: boolean;
  shadows: boolean;
  shadowMode: 'off' | 'static' | 'dynamic';
  pixelRatioCap: number;
  shadowMapSize: number;
};

const VALID_PROFILES = new Set<RenderProfile>(['performance', 'quality', 'compat']);

export function resolveRenderProfile(search: string, stored: string | null): RenderProfile {
  const requested = new URLSearchParams(search).get('render');
  if (requested === 'balanced') return 'performance';
  if (requested && VALID_PROFILES.has(requested as RenderProfile)) return requested as RenderProfile;
  if (stored === 'balanced') return 'performance';
  if (stored && VALID_PROFILES.has(stored as RenderProfile)) return stored as RenderProfile;
  return 'performance';
}

export function renderProfileConfig(profile: RenderProfile): RenderProfileConfig {
  if (profile === 'compat') {
    return {
      profile,
      representation: 'compat',
      reducedRepresentation: true,
      reducedWorldDetail: true,
      reducedPresentationDetail: true,
      staticMaterialMode: 'palette-basic',
      antialias: false,
      shadows: false,
      shadowMode: 'off',
      pixelRatioCap: 0.2,
      shadowMapSize: 0,
    };
  }
  if (profile === 'quality') {
    return {
      profile,
      representation: 'full',
      reducedRepresentation: false,
      reducedWorldDetail: true,
      reducedPresentationDetail: false,
      // Preserve authored texture maps, UVs and normals while still collapsing
      // meshes by texture/material class. Unmapped props remain palette-batched;
      // direct lighting supplies depth without the duplicate shadow-map pass.
      staticMaterialMode: 'texture-lit',
      antialias: true,
      shadows: false,
      shadowMode: 'off',
      pixelRatioCap: 1,
      shadowMapSize: 0,
    };
  }
  return {
    profile,
    representation: 'responsive',
    reducedRepresentation: true,
    reducedWorldDetail: true,
    reducedPresentationDetail: true,
    staticMaterialMode: 'palette-basic',
    antialias: false,
    shadows: false,
    shadowMode: 'off',
    pixelRatioCap: 0.75,
    shadowMapSize: 0,
  };
}
