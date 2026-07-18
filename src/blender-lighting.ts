import type { RenderProfile } from './render-profile';

export type ArenaLightingProfile = {
  exposure: number;
  hemisphereIntensity: number;
  ambientIntensity: number;
  sunIntensity: number;
  shadowBias: number;
  shadowNormalBias: number;
  softShadows: boolean;
  fogColor: number;
  fogNear: number;
  fogFar: number;
  skyTop: number;
  skyHorizon: number;
  skyBottom: number;
  skySun: number;
  skyCloud: number;
  hemisphereSky: number;
  hemisphereGround: number;
  ambientColor: number;
  sunColor: number;
  sunPosition: readonly [number, number, number];
  routeLightIntensity: number;
  streetLightIntensity: number;
  interiorLightIntensity: number;
  routeLightCount: number;
  streetLightCount: number;
  interiorLightCount: number;
  godRayStrength: number;
  godRayLobes: number;
};

const DEFAULT_LIGHTING: ArenaLightingProfile = {
  exposure: 1.02,
  hemisphereIntensity: 1.5,
  ambientIntensity: 0.55,
  sunIntensity: 2.7,
  shadowBias: -0.00028,
  shadowNormalBias: 0.025,
  softShadows: false,
  fogColor: 0xc3c9c2,
  fogNear: 64,
  fogFar: 148,
  skyTop: 0x6f8fa5,
  skyHorizon: 0xb8c9cf,
  skyBottom: 0xe2b987,
  skySun: 0xffd3a0,
  skyCloud: 0xe5e5dc,
  hemisphereSky: 0xd3e0e3,
  hemisphereGround: 0x777361,
  ambientColor: 0xc7cfca,
  sunColor: 0xffd2a2,
  sunPosition: [-62, 25, 38],
  routeLightIntensity: 3,
  streetLightIntensity: 4,
  interiorLightIntensity: 8,
  routeLightCount: 3,
  streetLightCount: 4,
  interiorLightCount: 2,
  godRayStrength: 0.08,
  godRayLobes: 2,
};

const BLENDER_LIGHTING: ArenaLightingProfile = {
  exposure: 1,
  hemisphereIntensity: 1.5,
  ambientIntensity: 0.52,
  sunIntensity: 2.7,
  shadowBias: -0.00012,
  shadowNormalBias: 0.04,
  softShadows: false,
  fogColor: 0xb8c1ba,
  fogNear: 58,
  fogFar: 136,
  skyTop: 0x66879e,
  skyHorizon: 0xb7c6cc,
  skyBottom: 0xe1b27c,
  skySun: 0xffd19b,
  skyCloud: 0xe2e2d7,
  hemisphereSky: 0xc9dadd,
  hemisphereGround: 0x6e6b5a,
  ambientColor: 0xbfc9c4,
  sunColor: 0xffc995,
  sunPosition: [-62, 25, 38],
  routeLightIntensity: 5,
  streetLightIntensity: 6,
  interiorLightIntensity: 12,
  routeLightCount: 3,
  streetLightCount: 4,
  interiorLightCount: 4,
  godRayStrength: 0.12,
  godRayLobes: 4,
};

const COMPAT_LIGHTING: ArenaLightingProfile = {
  ...DEFAULT_LIGHTING,
  exposure: 1.02,
  hemisphereIntensity: 1.55,
  ambientIntensity: 0.62,
  sunIntensity: 2.55,
  routeLightIntensity: 0,
  streetLightIntensity: 0,
  interiorLightIntensity: 0,
  routeLightCount: 0,
  streetLightCount: 0,
  interiorLightCount: 0,
  godRayStrength: 0,
  godRayLobes: 0,
};

export function arenaLightingProfile(profile: RenderProfile): ArenaLightingProfile {
  const source = profile === 'blender' ? BLENDER_LIGHTING : profile === 'compat' ? COMPAT_LIGHTING : DEFAULT_LIGHTING;
  return { ...source, sunPosition: [...source.sunPosition] };
}
