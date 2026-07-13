export type RenderProfile = 'balanced' | 'quality' | 'compat';

export const RENDER_PROFILE_STORAGE_KEY = 'atomic-acres-render-profile';

export type RenderProfileConfig = {
  profile: RenderProfile;
  reducedRepresentation: boolean;
  antialias: boolean;
  shadows: boolean;
  shadowMode: 'off' | 'static' | 'dynamic';
  pixelRatioCap: number;
  shadowMapSize: number;
};

const VALID_PROFILES = new Set<RenderProfile>(['balanced', 'quality', 'compat']);

export function resolveRenderProfile(search: string, stored: string | null): RenderProfile {
  const requested = new URLSearchParams(search).get('render');
  if (requested === 'performance') return 'balanced';
  if (requested && VALID_PROFILES.has(requested as RenderProfile)) return requested as RenderProfile;
  if (stored && VALID_PROFILES.has(stored as RenderProfile)) return stored as RenderProfile;
  return 'balanced';
}

export function renderProfileConfig(profile: RenderProfile): RenderProfileConfig {
  if (profile === 'compat') {
    return {
      profile,
      reducedRepresentation: true,
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
      reducedRepresentation: false,
      antialias: true,
      shadows: true,
      shadowMode: 'dynamic',
      pixelRatioCap: 1.5,
      shadowMapSize: 1024,
    };
  }
  return {
    profile,
    reducedRepresentation: false,
    antialias: true,
    shadows: true,
    shadowMode: 'static',
    pixelRatioCap: 1,
    shadowMapSize: 1024,
  };
}
