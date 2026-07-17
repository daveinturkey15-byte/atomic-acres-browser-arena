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
};

const DEFAULT_LIGHTING: ArenaLightingProfile = {
  exposure: 1.08,
  hemisphereIntensity: 1.2,
  ambientIntensity: 0.24,
  sunIntensity: 2.95,
  shadowBias: -0.00028,
  shadowNormalBias: 0.025,
  softShadows: false,
  fogColor: 0xa9b7ae,
  fogNear: 68,
  fogFar: 145,
  skyTop: 0x1d496d,
  skyHorizon: 0xaebfb4,
  skyBottom: 0xd8b783,
  skySun: 0xffc77f,
  skyCloud: 0xdde4d9,
  hemisphereSky: 0xc7dce2,
  hemisphereGround: 0x565344,
  ambientColor: 0xa8b6b1,
  sunColor: 0xffcf93,
  sunPosition: [-36, 64, 28],
  routeLightIntensity: 0.38,
};

const BLENDER_LIGHTING: ArenaLightingProfile = {
  exposure: 1,
  hemisphereIntensity: 0.9,
  ambientIntensity: 0.14,
  sunIntensity: 3.25,
  shadowBias: -0.00012,
  shadowNormalBias: 0.04,
  softShadows: false,
  fogColor: 0x9faaa0,
  fogNear: 58,
  fogFar: 128,
  skyTop: 0x123653,
  skyHorizon: 0x9eafa3,
  skyBottom: 0xc99d68,
  skySun: 0xffbd70,
  skyCloud: 0xd4dbcf,
  hemisphereSky: 0xb9d1d8,
  hemisphereGround: 0x48483c,
  ambientColor: 0x8f9f9a,
  sunColor: 0xffc786,
  sunPosition: [-40, 60, 24],
  routeLightIntensity: 1,
};

export function arenaLightingProfile(profile: RenderProfile): ArenaLightingProfile {
  const source = profile === 'blender' ? BLENDER_LIGHTING : DEFAULT_LIGHTING;
  return { ...source, sunPosition: [...source.sunPosition] };
}
