import type { RenderProfile } from './render-profile';

export type ArenaLightingProfile = {
  exposure: number;
  hemisphereIntensity: number;
  ambientIntensity: number;
  sunIntensity: number;
  shadowBias: number;
  shadowNormalBias: number;
  softShadows: boolean;
};

const DEFAULT_LIGHTING: ArenaLightingProfile = {
  exposure: 1.14,
  hemisphereIntensity: 1.48,
  ambientIntensity: 0.38,
  sunIntensity: 2.8,
  shadowBias: -0.00028,
  shadowNormalBias: 0.025,
  softShadows: false,
};

const BLENDER_LIGHTING: ArenaLightingProfile = {
  exposure: 1.02,
  hemisphereIntensity: 1,
  ambientIntensity: 0.18,
  sunIntensity: 2.45,
  shadowBias: -0.00012,
  shadowNormalBias: 0.04,
  softShadows: true,
};

export function arenaLightingProfile(profile: RenderProfile): ArenaLightingProfile {
  return { ...(profile === 'blender' ? BLENDER_LIGHTING : DEFAULT_LIGHTING) };
}
