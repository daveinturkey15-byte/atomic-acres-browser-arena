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
  // Owner 2026-08-29 shadow-side lift (see ATOMIC_BLENDER_LIGHTING).
  exposure: 1.02,
  hemisphereIntensity: 1.3,
  ambientIntensity: 0.42,
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
  fillIntensity: 0.45,
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
  // Owner 2026-08-29 ("the lighting was bad"): shadow sides crushed to
  // featureless black - lit:shadow ratio measured ~4.6:1 with combined
  // ambient+hemisphere at 0.9 vs sun 3.25. Fill light trio lifted so shadow
  // sides read (~2.9:1) while the sun keeps golden-hour directionality.
  exposure: 1.06,
  hemisphereIntensity: 1.2,
  ambientIntensity: 0.42,
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
  fillIntensity: 0.52,
  fillPosition: [54, 20, -42],
  routeLightIntensity: 3,
  streetLightIntensity: 3.8,
  // Owner 2026-08-30 interior richness: 10 read as murk inside the houses.
  interiorLightIntensity: 16,
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

/**
 * RustRig (rustworks-1v1) +25% brightness: owner feedback that the darkest
 * corridors and interior pockets were pitch black. Lift the ambient,
 * hemisphere, sun and fill contributions together (+25% each) and nudge
 * exposure so the whole map keeps its contrast without washing out. Derived
 * from BLENDER_LIGHTING so the blend/performance/compat family stays intact.
 */
const RUSTWORKS_BRIGHTENING: Readonly<Partial<ArenaLightingProfile>> = Object.freeze({
  ambientIntensity: 0.225,
  hemisphereIntensity: 0.875,
  sunIntensity: 3.9375,
  fillIntensity: 0.275,
  interiorLightIntensity: 18.75,
  exposure: 1.275,
});

/**
 * HF-535. THE NUKE TOWN SHADOW FLOOR, AS ONE MEASURED NUMBER.
 *
 * WHAT WAS WRONG. Under the arena's OWN authored sky (golden hour, 17.6 h) the
 * coach/building shadow footprint on `nuketown2-asphalt-road` renders at max
 * channel <= 6 over 19.5-25.4% of the `nuketown2-coach-elevation` frame — the
 * "black slab" down the middle of the street. Measured 2026-09-06 at base
 * 3278a930, 1280x720, native WebGPU, `render=quality`, `?tod=authored`:
 * `artifacts/shadowfloor/step1/terms.json` and `step2-combos/terms.json`.
 *
 * NO TERM IS ZERO — THE TONE CURVE'S TOE IS. Forced one at a time on the live
 * scene at the committed review frame, every indirect term measurably reaches
 * the shadowed road: scene.environmentIntensity 0.24 -> 1.0 takes the frame
 * from 19.5% to 4.9% exact-black, ambient x4 to 7.5%, hemisphere x4 to 4.4%,
 * this fill x4 to 11.7%. The shaded road's composed irradiance is ~0.5 and its
 * albedo ~0.04, so its radiance is ~0.0064; ACES (toneMapping 4) at exposure
 * 1.08 has a slope of ~0.21 down there, which lands the pixel on 4-6/255 —
 * inside the exact-black test band. The material's own `envMapIntensity` is the
 * ONE lever with literally no effect (19.54% before and after x8): on this
 * route `scene.environment` is scaled by `scene.environmentIntensity` alone.
 *
 * WHY THE FILL AND NOTHING ELSE. Per point of frame luma spent on the SUNLIT
 * half of the picture, the shadow-side fill buys 26 points of exact-black back;
 * ambient, hemisphere and the environment each buy about 2. At x6 this fill
 * takes the frame from 19.5% to 5.2% exact-black for +0.4% on sunlit pixels,
 * +0.0% on the sky and +0.1% on the roofs, and it lifts the previously-black
 * footprint to a mean max-channel of 28.8 — which is where the generated target
 * board `refs-boards/nuketown2/coach-elevation.target.png` puts its own darkest
 * 5% (p5 = 29). The number below is that measurement, not a taste.
 *
 * WHAT THIS IS NOT. No light is created, destroyed, parented or toggled, no
 * material is added or cloned, no family graph is edited and no uniform node is
 * introduced: this is one intensity VALUE on the `shadow-side-arena-fill`
 * `DirectionalLight` that every profile already builds, so the WebGPU light set
 * and the program set are untouched. It is arena-scoped exactly the way
 * `RUSTWORKS_BRIGHTENING` already is, so no other arena moves.
 */
export const NUKETOWN2_SHADOW_SIDE_FILL_INTENSITY = 1.5;

/**
 * The floor this arena's shadow side must not fall below again. The applied
 * value may rise above it; a future edit that drops under it fails
 * `src/nuketown2-shadow-floor.test.ts` rather than silently re-blacking the
 * street.
 */
export const NUKETOWN2_SHADOW_FLOOR_MINIMUM_FILL_INTENSITY = 1.4;

const NUKETOWN2_SHADOW_FLOOR: Readonly<Partial<ArenaLightingProfile>> = Object.freeze({
  fillIntensity: NUKETOWN2_SHADOW_SIDE_FILL_INTENSITY,
});

export function arenaLightingProfile(profile: RenderProfile, arenaId?: string): ArenaLightingProfile {
  const base = profile === 'blender' ? BLENDER_LIGHTING : profile === 'compat' ? COMPAT_LIGHTING : DEFAULT_LIGHTING;
  const source = arenaId === 'atomic-acres' && profile !== 'compat'
    ? profile === 'blender' ? ATOMIC_BLENDER_LIGHTING : ATOMIC_DEFAULT_LIGHTING
    : arenaId === 'rustworks-1v1' && profile !== 'compat'
      ? { ...base, ...RUSTWORKS_BRIGHTENING }
      : arenaId === 'nuketown2' && profile !== 'compat'
        ? { ...base, ...NUKETOWN2_SHADOW_FLOOR }
        : base;
  return { ...source, sunPosition: [...source.sunPosition], fillPosition: [...source.fillPosition] };
}
