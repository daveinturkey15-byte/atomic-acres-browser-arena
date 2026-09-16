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
export const NUKETOWN2_SHADOW_SIDE_FILL_INTENSITY = 0.18;

/**
 * The floor this arena's shadow side must not fall below again. The applied
 * value may rise above it; a future edit that drops under it fails
 * `src/nuketown2-shadow-floor.test.ts` rather than silently re-blacking the
 * street.
 */
export const NUKETOWN2_SHADOW_FLOOR_MINIMUM_FILL_INTENSITY = 0.16;

const NUKETOWN2_SHADOW_FLOOR: Readonly<Partial<ArenaLightingProfile>> = Object.freeze({
  ambientIntensity: 0.12,
  // Open-sky fill must describe the clean painted forms as well as the baked
  // local bounce. Keep the directional shadow-side floor and light set fixed.
  hemisphereIntensity: 0.6,
  hemisphereSky: 0xbdd7ee,
  hemisphereGround: 0xa8ad8c,
  fillIntensity: NUKETOWN2_SHADOW_SIDE_FILL_INTENSITY,
});

/**
 * ATOMIC ACRES REBUILD — A MIDMORNING MAP WAS STANDING IN THE SUNSET DEFAULT.
 *
 * WHAT WAS WRONG. `arenaLightingProfile` carries per-arena branches for
 * `atomic-acres`, `rustworks-1v1` and `nuketown2` only, so the rebuild fell
 * through to DEFAULT_LIGHTING — and DEFAULT_LIGHTING is a SUNSET profile
 * (`skyTop 0x58466e` violet, `skyHorizon 0xca8f86`, `skyBottom 0xeaa367`,
 * `sunColor 0xffd2a2`). The arena's visual definition already overrides the
 * things a definition CAN reach — the sky preset (`range-midmorning`, a blue
 * midmorning gradient from zenith `#2f5f9e` to horizon `#e7d9ba`), the key
 * colour, the ambient and the fog — but `hemisphereSky`, `hemisphereGround`,
 * `fillColor` and `sunPosition` come from the PROFILE, not the definition
 * (legacy-main.ts `applySelectedArenaVisualDefinition`). So a map authored for
 * a clear late morning was lit by a sunset's indirect, at a sunset's sun angle,
 * under its own blue sky. That single inheritance is both halves of the night
 * critic's severity-5 gap:
 *
 *   THE LAVENDER. `hemisphereSky 0xcbbacb` is pink-lavender (linear green
 *   deviation -0.106) and carries 0.547 of the 0.854 of indirect irradiance a
 *   horizontal surface receives — twice the arena's own ambient. `fillColor
 *   0xd8ddff` is blue-violet (linear green deviation -0.120). Ablated on the
 *   shipped chain at constant luminance, the two of them own 0.041 of the
 *   0.113 green deviation measured on a shaded NEUTRAL GREY wall
 *   (`massing 0xb9bcc0`); the arena's own CDL owns the other 0.071 and is
 *   pinned by `art-direction.test.ts` (see the lane note — it is NOT touched).
 *
 *   THE HAZY SUN. `sunPosition [-62, 25, 38]`, aimed by graphics-refinement.ts
 *   at `(centreX, 2.4, centreZ)`, is 17.26 degrees of elevation. On a
 *   horizontal surface the 3.2 key therefore delivers 0.795 against 0.854 of
 *   composed fill: THE FILL OUT-LIGHTS THE KEY on every road, yard, patio and
 *   sand plane in the map. Measured end to end that is a shade:lit display
 *   ratio of 0.616 on asphalt and 0.818 on sand, i.e. a shadow that is barely a
 *   shadow — and it matches the capture, which measures 0.515 on
 *   `repo-state/rb8-rebuild-topdown.png` against a model prediction of 0.518.
 *
 * WHAT MOVES, AND WHERE EACH NUMBER COMES FROM. Nothing here is invented and
 * nothing here is an intensity.
 *
 * 1. `sunPosition [-62, 25, 38] -> [-52.7, 45.7, 32.3]`. This is a PURE
 *    ELEVATION ROTATION of the shared standoff: 17.26 -> 35.01 degrees with the
 *    AZIMUTH unchanged, so no shadow direction in plan moves. 35 degrees is not
 *    a new number — it is ATOMIC_DEFAULT_LIGHTING's own daylight elevation
 *    (`[-48, 42, 30]` = 34.98 degrees), authored for THIS PLACE and re-pinned by
 *    the owner on 2026-08-29. The rotation preserves the standoff's MAGNITUDE
 *    to 0.03 m (76.90 -> 76.87) because graphics-refinement.ts derives this
 *    arena's shadow `far: 176` from "the volume's own diagonal (96.3 m) plus the
 *    shared non-Atomic sun standoff (|[-62, 25, 38]| = 76.9 m)": a rotation
 *    keeps that shipped derivation true without editing the file it lives in.
 *    It also puts the cast shadow at 1/tan(35) = 1.43x object height instead of
 *    3.22x. The graybox plate corroborates that ORDER — the crate, fence and
 *    pole shadows in `batch-4-nuketown-graybox/photo_street_01.png` run a little
 *    longer than the objects casting them, not three times longer — but that is
 *    an uncalibrated read of an oblique aerial and is NOT the derivation. The
 *    derivation is the sibling profile above.
 *    THE KEY CONTRIBUTES NOTHING TO A SURFACE IT CANNOT REACH, so every shaded
 *    pixel in the map is unchanged by this move and only the sunlit side rises.
 *
 * 2. `hemisphereSky 0xcbbacb -> 0xc3bebb` and `fillColor 0xd8ddff -> 0xe4deda`.
 *    Both are FLAT INDIRECT terms and this arena already authors the hue of its
 *    flat indirect: `ambientColor 0xb7b2af`, derived in the arena module's own
 *    note 2 as the half-sky/half-sunlit-sand hemisphere a shaded surface
 *    actually sees. The three terms now agree instead of contradicting each
 *    other. HUE ONLY: each is renormalised to the Rec.709 luminance of the
 *    value it replaces on the DEFAULT base (0.5213 and 0.7353 linear). Checked
 *    on all three bases this partial composes over, because it is a fixed set
 *    of hexes exactly as RUSTWORKS_BRIGHTENING and NUKETOWN2_SHADOW_FLOOR are:
 *    shaded horizontal irradiance moves -0.11% on DEFAULT, +2.68% (i.e.
 *    BRIGHTER, because BLENDER authors a slightly dimmer 0xcbb4ca) on BLENDER
 *    and -0.12% on COMPAT; a shaded wall moves +0.04 / +0.28 / +0.06%. NOTHING
 *    DARKENS ON ANY PROFILE, so no readability floor, threshold or budget can
 *    move.
 *
 * 3. `hemisphereGround 0x9d967f -> 0xaf9261`. The ground half of that same
 *    derivation — this arena's own sand albedo `0xd6c49a` through its own key
 *    `0xffe9c8` — renormalised to the replaced value's luminance (0.3051).
 *    Hue only, same rule.
 *
 * WHAT THIS IS NOT. No light is created, destroyed, parented or toggled; no
 * intensity, exposure, bias, budget or threshold appears below;
 * `hemisphereIntensity 1.05`, `fillIntensity 0.32`, the arena's
 * `ambientIntensity 0.55` (raid2's measured 0.44 silhouette finding) and its
 * `sunIntensity 3.2` are all deliberately untouched. It is arena-scoped exactly
 * the way RUSTWORKS_BRIGHTENING and NUKETOWN2_SHADOW_FLOOR already are, so no
 * other arena moves.
 *
 * WHY IT IS NOT GUARDED BY `profile !== 'compat'`, unlike the three branches
 * above it. Those three change INTENSITIES, which would fight COMPAT_LIGHTING's
 * deliberate flat brightening for the software/WebGL2 route. This one contains
 * no intensity — only hue and a sun direction. Excluding compat would make the
 * SUN DIRECTION, which is gameplay-visible, differ by render profile, and
 * "nothing gameplay-visible may vary between presets" is the parity rule this
 * repo already holds art direction to.
 *
 * PREDICTED, AND THE MEASUREMENT THAT DECIDES IT. Through the shipped chain
 * (ACES filmic, exposure 1.04, this arena's art-direction row), shade:lit goes
 * 0.616 -> 0.489 on asphalt, 0.818 -> 0.776 on sand and 0.851 -> 0.815 on
 * massing, while green deviation on shaded massing goes -0.113 -> -0.075 and on
 * shaded sand -0.087 -> -0.037. The one thing to watch in the recapture is the
 * highlight end: sunlit luminance rises +0.035 to +0.06 on the high-albedo
 * greybox surfaces, so `frac > 0.9` and p99 are the numbers that decide whether
 * this needs a shoulder correction next round.
 */
const ATOMIC_ACRES_REBUILD_LIGHTING: Readonly<Partial<ArenaLightingProfile>> = Object.freeze({
  hemisphereSky: 0xc3bebb,
  hemisphereGround: 0xaf9261,
  fillColor: 0xe4deda,
  sunPosition: [-52.7, 45.7, 32.3] as const,
});

export function arenaLightingProfile(profile: RenderProfile, arenaId?: string): ArenaLightingProfile {
  const base = profile === 'blender' ? BLENDER_LIGHTING : profile === 'compat' ? COMPAT_LIGHTING : DEFAULT_LIGHTING;
  const source = arenaId === 'atomic-acres' && profile !== 'compat'
    ? profile === 'blender' ? ATOMIC_BLENDER_LIGHTING : ATOMIC_DEFAULT_LIGHTING
    : arenaId === 'rustworks-1v1' && profile !== 'compat'
      ? { ...base, ...RUSTWORKS_BRIGHTENING }
      : arenaId === 'nuketown2' && profile !== 'compat'
        ? { ...base, ...NUKETOWN2_SHADOW_FLOOR }
        // Hue and sun direction only, so it composes over every profile
        // including compat without fighting COMPAT_LIGHTING's flat brightening.
        : arenaId === 'atomic-acres-rebuild'
          ? { ...base, ...ATOMIC_ACRES_REBUILD_LIGHTING }
          : base;
  return { ...source, sunPosition: [...source.sunPosition], fillPosition: [...source.fillPosition] };
}
