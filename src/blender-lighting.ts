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
  skyCloudShadow: number;
  skyCloudLight: number;
  hemisphereSky: number;
  hemisphereGround: number;
  ambientColor: number;
  sunColor: number;
  sunPosition: readonly [number, number, number];
  fillColor: number;
  fillIntensity: number;
  fillPosition: readonly [number, number, number];
  routeLightIntensity: number;
  streetLightIntensity: number;
  interiorLightIntensity: number;
  routeLightCount: number;
  streetLightCount: number;
  interiorLightCount: number;
  godRayStrength: number;
  godRayLobes: number;
};

const ATOMIC_DEFAULT_LIGHTING: ArenaLightingProfile = {
  exposure: 1.02,
  hemisphereIntensity: 1.05,
  ambientIntensity: 0.32,
  sunIntensity: 2.65,
  shadowBias: -0.00028,
  shadowNormalBias: 0.025,
  softShadows: false,
  fogColor: 0xaebdbd,
  fogNear: 62,
  fogFar: 152,
  skyTop: 0x5588a8,
  skyHorizon: 0xdba77f,
  skyBottom: 0xe7bd88,
  skySun: 0xffedc4,
  skyCloud: 0xcbd5d1,
  skyCloudShadow: 0x5e7187,
  skyCloudLight: 0xf5dfc5,
  hemisphereSky: 0xc9d8dc,
  hemisphereGround: 0xb6aa8d,
  ambientColor: 0xe4e8df,
  sunColor: 0xffedc8,
  sunPosition: [-48, 42, 30],
  fillColor: 0xcce0ed,
  fillIntensity: 0.28,
  fillPosition: [54, 20, -42],
  routeLightIntensity: 2.4,
  streetLightIntensity: 3.2,
  interiorLightIntensity: 8,
  routeLightCount: 3,
  streetLightCount: 4,
  interiorLightCount: 2,
  godRayStrength: 0.035,
  godRayLobes: 2,
};

const ATOMIC_BLENDER_LIGHTING: ArenaLightingProfile = {
  exposure: 1,
  hemisphereIntensity: 0.72,
  ambientIntensity: 0.18,
  sunIntensity: 3.25,
  shadowBias: -0.00012,
  shadowNormalBias: 0.04,
  softShadows: true,
  fogColor: 0xaebdbd,
  fogNear: 58,
  fogFar: 148,
  skyTop: 0x4d83a5,
  skyHorizon: 0xdda77d,
  skyBottom: 0xe9bc84,
  skySun: 0xffefc8,
  skyCloud: 0xcbd6d2,
  skyCloudShadow: 0x5e7187,
  skyCloudLight: 0xf5dfc5,
  hemisphereSky: 0xc9dbe2,
  hemisphereGround: 0xb8ab8d,
  ambientColor: 0xe6e9df,
  sunColor: 0xfff0cb,
  sunPosition: [-48, 42, 30],
  fillColor: 0xc9dfef,
  fillIntensity: 0.2,
  fillPosition: [54, 20, -42],
  routeLightIntensity: 3,
  streetLightIntensity: 3.8,
  interiorLightIntensity: 10,
  routeLightCount: 3,
  streetLightCount: 4,
  interiorLightCount: 4,
  godRayStrength: 0.05,
  godRayLobes: 2,
};

const DEFAULT_LIGHTING: ArenaLightingProfile = {
  exposure: 1.06,
  hemisphereIntensity: 1.05,
  ambientIntensity: 0.34,
  sunIntensity: 2.7,
  shadowBias: -0.00028,
  shadowNormalBias: 0.025,
  softShadows: false,
  fogColor: 0xb8adb8,
  fogNear: 56,
  fogFar: 140,
  skyTop: 0x58466e,
  skyHorizon: 0xca8f86,
  skyBottom: 0xeaa367,
  skySun: 0xffcf93,
  skyCloud: 0xd69a86,
  skyCloudShadow: 0x442953,
  skyCloudLight: 0xff914c,
  hemisphereSky: 0xcbbacb,
  hemisphereGround: 0x9d967f,
  ambientColor: 0xdce3dd,
  sunColor: 0xffd2a2,
  sunPosition: [-62, 25, 38],
  fillColor: 0xd8ddff,
  fillIntensity: 0.32,
  fillPosition: [54, 20, -42],
  routeLightIntensity: 3,
  streetLightIntensity: 4,
  interiorLightIntensity: 11,
  routeLightCount: 3,
  streetLightCount: 4,
  interiorLightCount: 2,
  godRayStrength: 0.08,
  godRayLobes: 2,
};

const BLENDER_LIGHTING: ArenaLightingProfile = {
  exposure: 1.02,
  hemisphereIntensity: 0.7,
  ambientIntensity: 0.18,
  sunIntensity: 3.15,
  shadowBias: -0.00012,
  shadowNormalBias: 0.04,
  softShadows: true,
  fogColor: 0xb0a5b5,
  fogNear: 50,
  fogFar: 128,
  skyTop: 0x46385f,
  skyHorizon: 0xcf8a7c,
  skyBottom: 0xf0a15f,
  skySun: 0xffc887,
  skyCloud: 0xd99380,
  skyCloudShadow: 0x382149,
  skyCloudLight: 0xff873f,
  hemisphereSky: 0xcbb4ca,
  hemisphereGround: 0xa39a84,
  ambientColor: 0xdfe3dc,
  sunColor: 0xffc995,
  sunPosition: [-62, 25, 38],
  fillColor: 0xd8ddff,
  fillIntensity: 0.22,
  fillPosition: [54, 20, -42],
  routeLightIntensity: 5,
  streetLightIntensity: 6,
  interiorLightIntensity: 15,
  routeLightCount: 3,
  streetLightCount: 4,
  interiorLightCount: 4,
  godRayStrength: 0.12,
  godRayLobes: 4,
};

const COMPAT_LIGHTING: ArenaLightingProfile = {
  ...DEFAULT_LIGHTING,
  exposure: 1.16,
  hemisphereIntensity: 1.9,
  ambientIntensity: 0.86,
  sunIntensity: 2.5,
  fillIntensity: 0.66,
  routeLightIntensity: 0,
  streetLightIntensity: 0,
  interiorLightIntensity: 0,
  routeLightCount: 0,
  streetLightCount: 0,
  interiorLightCount: 0,
  godRayStrength: 0,
  godRayLobes: 0,
};

export function arenaLightingProfile(profile: RenderProfile, arenaId?: string): ArenaLightingProfile {
  const source = arenaId === 'atomic-acres' && profile !== 'compat'
    ? profile === 'blender' ? ATOMIC_BLENDER_LIGHTING : ATOMIC_DEFAULT_LIGHTING
    : profile === 'blender' ? BLENDER_LIGHTING : profile === 'compat' ? COMPAT_LIGHTING : DEFAULT_LIGHTING;
  return { ...source, sunPosition: [...source.sunPosition], fillPosition: [...source.fillPosition] };
}
