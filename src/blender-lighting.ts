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

/**
 * ROUND 2 — THE SKY IS IN THE FRAME TWICE, AND THE INTERIOR PAYS FOR IT.
 *
 * WHERE ROUND 1 LEFT IT. The hue half of the block above landed: re-metered on
 * `repo-state/rb11-rebuild-*.png` against `rb8-*`, green deviation improved in
 * 31 of 32 named regions and `r-b` warmed in all 32. The VALUE half did not.
 * Round 1 moved only the sun angle, so it lifted the sunlit side by 45% and
 * left the flat indirect exactly where it was — and this arena's `interior-west`
 * review camera, the frame the owner called flat and directionless, is the one
 * camera in the map the key does not reach at all. Measured on it: p99 = 0.841
 * and `frac > 0.9` = 0.000, i.e. NOT ONE PIXEL in that room is key-lit.
 *
 * 0. WHICH PROFILE THESE FRAMES ARE, ESTABLISHED FROM SOURCE RATHER THAN
 *    INFERRED. `scripts/qa/capture-arena-viewpoints.mjs` hardcodes
 *    `render=quality` into the capture URL, and `resolveRenderProfile`
 *    (render-profile.ts) maps `quality -> 'blender'` — and its no-preference
 *    fallback is `'blender'` too, so the owner's own session resolves there as
 *    well. EVERY review frame this arena has, and everything the owner sees, is
 *    the BLENDER base. Cross-checked: the 10:50 `render=quality` capture on
 *    nvidia/blackwell webgpu (`artifacts/viewpoint-regression/pre-polish/`) is
 *    identical to `rb11-rebuild-interior.png` to <= 0.0001 on every region and
 *    bit-identical on every frame percentile, so rb11 is a blender frame too.
 *    Lane R's incidental note that the captures were `performance` is WRONG,
 *    and wrong for an instructive reason: it was inferred by matching a modelled
 *    shade/lit of 0.518 against a measured 0.515, using a model that omitted the
 *    environment term in 2 below. Adding the missing term makes the blender
 *    composition match the same capture. An omitted light looks exactly like the
 *    wrong profile.
 *
 * 1. THE IRRADIANCE BUDGET OF THAT ROOM, SOLVED FROM THE CAPTURE. Inverting the
 *    shipped chain (exposure 1.04, this arena's art-direction row, ACES, the
 *    filmic display stages) on the measured `wall-far-plaster` pixel
 *    [0.5899, 0.5257, 0.5836] with that wall's authored albedo — `0x8f9296`, the
 *    graybox grey at `atomic-acres-rebuild-interiors.ts:509` — the wall must be
 *    receiving linear irradiance [0.9099, 0.8377, 0.7536], Y 0.8470. On the
 *    BLENDER base (hemisphere 0.7, fill 0.22, `indirectLightScale` 1 on every
 *    named quality preset) the rig accounts for only 0.5364 of it:
 *
 *      ambient      0xb7b2af x 0.55                    Y 0.2475   29.2%
 *      hemisphere   0.5 x (sky + ground) x 0.70        Y 0.2889   34.1%
 *      fill         0.22, ndl = 0 on this normal       Y 0.0000    0.0%
 *      RESIDUAL                                        Y 0.3105   36.7%
 *
 *    The budget closes to 0.00%. The residual is real and it is over a THIRD of
 *    the light in that room.
 *
 * 2. THE RESIDUAL HAS A NAME. `scene.environment` — a PMREM convolved off the
 *    `range-midmorning` backdrop — bound at `scene.environmentIntensity =
 *    graphicsEffectsBudget(profile).environmentIntensity x
 *    arenaEnvironmentScale('atomic-acres-rebuild') (0.24) x reflectionScale`.
 *    On blender, `renderProfileConfig` gives pixelRatioCap 1, so that budget is
 *    the `full` tier's 1.0 and the bound intensity is 0.24 — TWICE what the
 *    `performance` route binds. Its measured chromaticity is r:g:b =
 *    0.988 : 1.000 : 0.968, i.e. NEARLY NEUTRAL, which is the right answer and
 *    not a coincidence: a vertical normal's diffuse convolution takes half the
 *    upper hemisphere (blue, zenith stop #2f5f9e) and half the lower band,
 *    which `sky-backdrop.ts` paints WARM (#c7bb9c, #b39a72, #7d6c4e). The two
 *    halves cancel. Falsifiable in one run: drive `arenaEnvironmentScale` for
 *    this arena to 0 and exactly Y 0.311 must leave those two wall regions.
 *    The arena definition's own comment calls this IBL "(inert)". It is not
 *    inert; it is 37% of the light in the room.
 *
 * 3. SO THE SKY IS COUNTED TWICE, AND ON THIS BASE THE SECOND COUNT IS BIGGER
 *    THAN THE FIRST. `HemisphereLight(hemisphereSky, hemisphereGround, 0.7)` is
 *    a sky model and `scene.environment` is the same sky, convolved properly,
 *    added on top. On a vertical the hemisphere's SKY half is
 *    0.5 x Y(0xc3bebb) x 0.7 = 0.1821 and the IBL supplies Y 0.3105 — so the
 *    IBL ALONE ALREADY OVER-SUPPLIES THE SKY, and the honest de-double-count
 *    leaves the hemisphere carrying only its GROUND half, the sunlit-sand bounce
 *    the backdrop cannot supply because its lower band is painted sky rather
 *    than this map's ground: 0.5 x Y(0xaf9261) x 0.7 = 0.1069. A hemisphere
 *    whose total on a vertical is 0.1069 is
 *
 *      `hemisphereIntensity 0.7 -> 0.26`   (0.1069 / 0.4114 = 0.2589)
 *
 *    The intensity scales both halves, so this does not claim to zero the sky;
 *    it claims the hemisphere's TOTAL should shrink to the size of the one term
 *    the IBL cannot provide.
 *
 *      `fillIntensity 0.22 -> 0.482`. SOLVED, by bisection, as the fill that
 *      holds the exterior shadow-side fill-facing wall's rig irradiance EXACTLY
 *      where round 1 left it (0.7175 -> 0.7175). That is the quantity raid2's
 *      module measures its 0.44 silhouette finding on, so the finding is
 *      honoured by construction rather than by argument.
 *
 * 4. WHY THE INTERIOR IS ALLOWED TO GET DARKER — THE PLATES, MEASURED, NOT
 *    ASSERTED. sRGB-encoded frame luminance percentiles:
 *
 *                              p05    p25    p50    p95    p99   frac>0.9
 *      living-room-eye.png    0.109  0.234  0.359  0.767  0.943   0.025
 *      bedroom-eye.png        0.119  0.264  0.368  0.876  0.937   0.029
 *      interior-west (HEAD)   0.284  0.376  0.505  0.837  0.841   0.000
 *
 *    The render's interior is +0.175 at p05, +0.142 at p25 and +0.146 at p50
 *    against the bar, and it has NO highlight at all where both plates put
 *    2.5-2.9% of the frame above 0.9. The room is not too dark and it is not
 *    mis-hued; it is too BRIGHT in the shadows and it has no top end. Every
 *    number here moves it the way that table says, and none of them moves it
 *    far enough to overshoot.
 *
 *    This supersedes the "interior must not fall by more than 0.03" bound Lane
 *    R wrote on its unapplied draft. That bound was a check on whether ITS fill
 *    solve had held, not an art direction; measured against the plates the
 *    interior needs to fall by 0.146, so a bound forbidding 0.03 is measuring
 *    the wrong thing. No shipped test, gate or threshold is touched.
 *
 * 5. PREDICTED, PER SURFACE, THROUGH THE SHIPPED CHAIN, WITH THE IBL TERM
 *    CARRIED (it does not move, so it cushions every cut below). sRGB-encoded
 *    display luminance on the `interior-west` frame, blender base:
 *
 *      wall-right / wall-far plaster (no fill)   0.543 -> 0.466   -0.077
 *      ceiling (no fill)                         0.388 -> 0.336   -0.052
 *      floor (InteriorPlaster, ndl 0.249)        0.849 -> 0.814   -0.035
 *      kitchen cabinet run (full fill)           0.483 -> 0.484   +0.001  HELD
 *
 *    The model is validated against the capture on the rows it did not solve
 *    for: predicted wall 0.543 vs measured 0.544, predicted floor 0.849 vs
 *    measured 0.829. The ceiling row is the least pinned — its albedo is
 *    inferred rather than authored as a hex — and is quoted as approximate.
 *
 *    THAT LAST ROW IS THE POINT. `fillLight.castShadow = false`
 *    (legacy-main.ts), so the shadow-side fill is the ONE directional light
 *    that reaches inside a closed house. Trading 63% off an omnidirectional
 *    term onto an aimed one gives the room a light side and a dark side where
 *    it had neither: interior fill-lit vs fill-averted vertical goes from
 *    Y 1.003 / 0.846 (spread 0.157, ratio 1.19) to Y 1.009 / 0.664 (spread
 *    0.345, ratio 1.52). "Directionless" is a measurement, and that is the
 *    measurement moving.
 *
 * 6. EXTERIOR, AND THE PRICE. Shadow-side fill-facing wall 0.785 -> 0.785
 *    (-0.0001, the bisection's own rounding). Shaded horizontal ground
 *    0.728 -> 0.659. Sunlit ground 0.893 -> 0.885 — the ACES shoulder is flat up
 *    there, which is also why exposure was not the lever. Horizontal shade/lit
 *    0.385 -> 0.337, which is round 1's stated unfinished business. Silhouette
 *    separation for an operator at albedo 0.10 / 0.18 / 0.30 against the surface
 *    behind: shadow-side wall 0.491/0.327/0.156 -> 0.491/0.327/0.156
 *    (unchanged, to three places); shaded ground 0.451/0.289/0.123 ->
 *    0.433/0.281/0.127, i.e. -4.0% on the darkest operator and +3.3% on the
 *    brightest. Those are the veto numbers.
 *
 * 7. THE LAVENDER IS NOT THE RIG'S, AND HERE IS THE ABLATION THAT SAYS SO.
 *    Through the shipped chain on the interior wall, blender base:
 *
 *      radiance (albedo x irradiance), pre-grade   r-b +0.0201  gdev +0.0009
 *      as shipped                                  r-b +0.0064  gdev -0.0609
 *      arena CDL gain neutralised                  r-b -0.0059  gdev +0.0517
 *      neutral albedo, CDL kept                    r-b +0.0506  gdev -0.0588
 *      IBL removed (rig only)                      r-b +0.0279  gdev -0.0381
 *
 *    The radiance leaving that wall is DEAD NEUTRAL before the grade touches it
 *    (gdev +0.0009): round 1's warm indirect and the near-neutral IBL compose to
 *    neutral. Every bit of the displayed cast is the arena's CDL gain
 *    [1.18, 0.82, 1.18] — a PURE green cut, red and blue identical — which moves
 *    green by 0.1126 on its own and renders any neutral as magenta. The wall's
 *    own albedo owns the small `r-b` tilt and 0.002 of the green; the IBL owns
 *    0.023, by diluting warmth rather than by adding blue. THERE IS NO HUE LEFT
 *    IN THIS FILE TO SPEND: round 1 already neutralised every hex the rig owns,
 *    and warming them further to cancel a grade would be masking. The owner of
 *    what remains is the catalog hue assignment behind that CDL row, which
 *    `art-direction.test.ts` pins and which Lane R already costed: every
 *    relaxation past a 0.86 green gain fails the 5.5/255 distinctiveness floor.
 *
 * 8. NOR DOES THIS PUT SUN ON AN INTERIOR FLOOR. It cannot: there is no aperture
 *    for the key to come through. `dressWindow` (atomic-acres-rebuild-arena.ts)
 *    builds `-casing`, `-reveal` and `-shutter` boxes on the shell's OUTER
 *    plane — solid meshes, not a hole — so every graybox "window" in this map is
 *    opaque, and `frac > 0.9` = 0.000 on the interior frame is the receipt. The
 *    rig-side lever that would matter once an aperture exists is the sun
 *    AZIMUTH, which round 1 deliberately held fixed because it is
 *    gameplay-visible; moving it on a guess is the move this method forbids.
 *    Reported, not attempted — the aperture is owned by the arena module.
 *
 * 9. WHY THERE ARE TWO PARTIALS AND NOT ONE NUMBER. Both values are INTENSITIES
 *    solved against a specific base AND against a specific environment budget,
 *    and neither premise survives a change of either:
 *
 *      blender      base 0.7 / 0.22, environment budget 1.0 -> IBL Y 0.3105.
 *                   DERIVED ABOVE, on the frames the harness and the owner both
 *                   actually load. hemisphere 0.26, fill 0.482.
 *      performance  base 1.05 / 0.32, environment budget 0.5 (pixelRatioCap
 *                   0.75 -> the `balanced` tier) -> the same IBL at HALF the
 *                   intensity, Y 0.155. The sky half here is
 *                   0.5 x 0.5173 x 1.05 = 0.2716, which the IBL does NOT
 *                   over-supply, so the subtraction is finite:
 *                   0.2716 - 0.155 = 0.1166, plus the ground half 0.1603, gives
 *                   0.2769 -> hemisphereIntensity 0.673. Shipped at 0.6 — the
 *                   value NUKETOWN2_SHADOW_FLOOR above already authors for this
 *                   field on this rig, owner-reviewed, 11% below the derivation
 *                   on the side the plates in 4 ask for — with fill 0.588 from
 *                   the same exact-hold bisection on its own base. This route
 *                   has no capture of its own; its IBL term is the blender
 *                   measurement scaled by the documented budget ratio, and that
 *                   is stated rather than hidden.
 *      compat       environment budget is 0 — there is no second sky on the
 *                   software/WebGL2 route, so there is no double count to
 *                   remove, and COMPAT_LIGHTING's deliberate flat brightening
 *                   (hemisphere 1.9, fill 0.66) is load-bearing for that route's
 *                   playability. Left bit-identical.
 *
 *    Note the two derivations agree on the PHYSICS even though they disagree on
 *    the bookkeeping: the interior wall loses 21.5% of its irradiance on blender
 *    and 21.4% on performance. The split below is about which base each number
 *    is correct FOR, not about two different looks.
 *
 *    Verified mechanically rather than asserted: resolving `arenaLightingProfile`
 *    for all 13 arenas plus the no-arena case across all three profiles, 40 of
 *    the 42 results are byte-identical to HEAD and the 2 that move are
 *    `atomic-acres-rebuild` on `blender` and on `performance`.
 *
 * WHAT THIS IS NOT. No light is created, destroyed, parented, hidden or
 * toggled: every field below is an intensity VALUE on the `HemisphereLight` and
 * the `shadow-side-arena-fill` `DirectionalLight` that every profile already
 * builds, so the light set and therefore the WebGPU program set are untouched
 * (PASS 82). No count, no exposure, no bias, no budget and no threshold appears
 * here. Arena-scoped exactly as RUSTWORKS_BRIGHTENING and NUKETOWN2_SHADOW_FLOOR
 * already are, so no other arena moves.
 */
const ATOMIC_ACRES_REBUILD_SHADE_DEPTH_BLENDER: Readonly<Partial<ArenaLightingProfile>> = Object.freeze({
  hemisphereIntensity: 0.26,
  fillIntensity: 0.482,
});

const ATOMIC_ACRES_REBUILD_SHADE_DEPTH_PERFORMANCE: Readonly<Partial<ArenaLightingProfile>> = Object.freeze({
  hemisphereIntensity: 0.6,
  fillIntensity: 0.588,
});

export function arenaLightingProfile(profile: RenderProfile, arenaId?: string): ArenaLightingProfile {
  const base = profile === 'blender' ? BLENDER_LIGHTING : profile === 'compat' ? COMPAT_LIGHTING : DEFAULT_LIGHTING;
  const source = arenaId === 'atomic-acres' && profile !== 'compat'
    ? profile === 'blender' ? ATOMIC_BLENDER_LIGHTING : ATOMIC_DEFAULT_LIGHTING
    : arenaId === 'rustworks-1v1' && profile !== 'compat'
      ? { ...base, ...RUSTWORKS_BRIGHTENING }
      : arenaId === 'nuketown2' && profile !== 'compat'
        ? { ...base, ...NUKETOWN2_SHADOW_FLOOR }
        // The hue and sun direction compose over EVERY profile including compat:
        // they are hexes and a direction, they cannot fight COMPAT_LIGHTING's
        // deliberate flat brightening, and the sun direction is gameplay-visible
        // so it must not vary by preset. The shade-depth values are INTENSITIES,
        // each solved against its own base AND its own environment budget, so
        // they are selected per base rather than shared — and compat, whose
        // environment budget is 0, takes neither (section 9 above).
        : arenaId === 'atomic-acres-rebuild'
          ? profile === 'compat'
            ? { ...base, ...ATOMIC_ACRES_REBUILD_LIGHTING }
            : {
              ...base,
              ...ATOMIC_ACRES_REBUILD_LIGHTING,
              ...(profile === 'blender'
                ? ATOMIC_ACRES_REBUILD_SHADE_DEPTH_BLENDER
                : ATOMIC_ACRES_REBUILD_SHADE_DEPTH_PERFORMANCE),
            }
          : base;
  return { ...source, sunPosition: [...source.sunPosition], fillPosition: [...source.fillPosition] };
}
