import * as THREE from 'three';

export type SkyBackdropPreset =
  | 'sunset-farmland'
  | 'industrial-night'
  | 'airport-dawn'
  | 'indoor-range'
  | 'jungle-golden-hour'
  | 'open-ocean-day'
  | 'range-midmorning'
  | 'estate-golden-hour';

export const SKY_BACKDROP_TEXTURE_SIZE = Object.freeze({ width: 2_048, height: 1_024 });
export const ATOMIC_ACRES_GENERATED_SKY_ASSET_URL = './assets/original/skies/atomic-acres-sunset.webp';
export const ATOMIC_ACRES_GENERATED_SKY_PROVENANCE_PATH = 'source-assets/skies/atomic-acres-sunset.provenance.json';
export const RUSTWORKS_GENERATED_SKY_ASSET_URL = './assets/original/skies/rustworks-industrial-night.webp';
export const RUSTWORKS_GENERATED_SKY_PROVENANCE_PATH = 'source-assets/skies/rustworks-industrial-night.provenance.json';
export const TERMINAL_GENERATED_SKY_ASSET_URL = './assets/original/skies/terminal-airport-dawn.webp';
export const TERMINAL_GENERATED_SKY_PROVENANCE_PATH = 'source-assets/skies/terminal-airport-dawn.provenance.json';
export const SKY_BACKDROP_WEBGPU_ADMISSION_TIMEOUT_MS = 4_000;

export type SkyBackdropStatus = 'procedural-ready' | 'asset-loading' | 'asset-ready' | 'procedural-fallback';

type GradientStop = readonly [offset: number, css: string];

/**
 * Owner-directed per-arena sky gradients.
 *
 * This is a `scene.background` equirectangular gradient rather than dome
 * geometry, so it is identical on the WebGPU path and the WebGL2 compatibility
 * path (HF-331: Firefox 141+ on Windows ships WebGPU and takes the WebGPU
 * route; WebGL2 remains for Safari and older browsers). It is drawn behind every
 * object, so it can never be frustum-clipped by the 180 m camera far plane nor
 * washed out by the gameplay fog band - both of which previously left arenas
 * with no visible sky at all.
 */
const SKY_BACKDROP_GRADIENTS: Readonly<Record<SkyBackdropPreset, readonly GradientStop[]>> = Object.freeze({
  // Deep sunset: indigo zenith through violet and a broad burnt-orange band
  // into a glowing gold horizon. Owner wanted a much richer Atomic Acres sky.
  'sunset-farmland': Object.freeze([
    [0, '#150d38'],
    [0.18, '#2c1654'],
    [0.38, '#5c2566'],
    [0.55, '#9c3a5e'],
    [0.68, '#d4553f'],
    [0.8, '#f07f36'],
    [0.9, '#fca94a'],
    [1, '#ffd98a'],
  ] as const),
  // True night: near-black zenith with a faint aurora-green horizon lift.
  'industrial-night': Object.freeze([
    [0, '#04070f'],
    [0.42, '#0a1526'],
    [0.74, '#13314a'],
    [0.92, '#1c5157'],
    [1, '#27706a'],
  ] as const),
  // Plain bright day for the terminal apron.
  'airport-dawn': Object.freeze([
    [0, '#3f86c9'],
    [0.44, '#79b6e0'],
    [0.78, '#bcd9ec'],
    [1, '#e6eff5'],
  ] as const),
  // Interior range: flat dark ceiling tone, no visible sky.
  'indoor-range': Object.freeze([
    [0, '#151d22'],
    [1, '#232f36'],
  ] as const),
  // Tropical DAYLIGHT over a jungle island - the Far Cry / Crysis showcase
  // look the owner asked for: a saturated blue zenith washing to a bright
  // humid haze at the waterline. This preset previously carried a golden-hour
  // dusk band (deep blue through amber to warm cream) which, stacked on the
  // arena's own warm light rig, rendered the whole island flat beige - the
  // single most-reported thing about how farcrysis looked.
  //
  // The haze band is deliberately SHORT. A player at eye level looks at the
  // bottom of this gradient, so a wide pale band there is all they ever see -
  // the first daylight attempt kept blue at the zenith and still rendered a
  // white sky in-game. Real blue now runs down to ~0.9.
  'jungle-golden-hour': Object.freeze([
    [0, '#08418c'],
    [0.30, '#155fae'],
    [0.55, '#2a7cc6'],
    [0.75, '#4d9ad6'],
    [0.90, '#87bce4'],
    [1, '#c4dfef'],
  ] as const),
  // Open water under a high sun: saturated marine zenith, bleaching toward a
  // bright haze band where sea meets sky.
  'open-ocean-day': Object.freeze([
    [0, '#0f4f9b'],
    [0.3, '#2f7fc4'],
    [0.58, '#69aad9'],
    [0.82, '#a9cfe8'],
    [1, '#dceaf2'],
  ] as const),
  // Owner 2026-08-30 (v2): Test1 - hard clear mid-morning over a dusty range.
  //
  // Authored around the TRUE horizon at offset 0.5, and with the lower half
  // authored as ground rather than as more sky. Two reasons, both structural:
  //
  // 1. This texture is an equirectangular `scene.background`, so its vertical
  //    axis is the polar angle: 0 = zenith, 0.5 = horizon, 1 = nadir. The v1
  //    stops ran their bleached band from 0.72 to 1.0, i.e. entirely BELOW the
  //    horizon where the terrain covers it, and left the player's actual sky
  //    band (roughly 0.31-0.50 for a level 70-degree camera) sitting on the
  //    mid-gradient. The same mistake is recorded for jungle-golden-hour at
  //    SKY_BACKDROP_CLOUDS below, diagnosed there from the opposite direction.
  // 2. arena-environment-ibl.ts PMREMs this exact texture into
  //    scene.environment, so the lower hemisphere IS the arena's ground-bounce
  //    irradiance band and the upper hemisphere IS its sky-fill band. Painting
  //    both halves as sky gave every downward-facing normal - soffits, awning
  //    undersides, container overhangs, the tower deck's underside - a bright
  //    cream skylight it can never physically receive. Authoring the lower half
  //    as pale hardpan (test-maps-art.ts hardpan base 0xb59a6e) under this
  //    arena's own warm key is what turns one flat ambient constant into the
  //    two-band, normal-gated fill the upstream extraction calls for, using the
  //    irradiance convolution PMREM already runs instead of a shader patch.
  //
  // CORRECTION to point 2 (art pass 2026-08-30): `scene.environment` measures
  // NULL on all eight arenas on the WebGPU quality route, so PMREM is not
  // reaching the scene and the lower-hemisphere authoring below currently
  // lights nothing. It is kept - it costs nothing and is correct the moment the
  // IBL is reconnected - but no lighting decision may lean on it. See the
  // matching note at the top of src/rendering/arenas/test1.ts.
  //
  // ART PASS 2026-08-30: THE BLEACH BAND WAS EATING THE WHOLE VISIBLE SKY, and
  // the visible sky is far narrower than v2 assumed. The stop positions below
  // are MEASURED against the two cameras that exist, not guessed.
  //
  // The menu flyover pitches 33 degrees down from 22 m, and this arena's own
  // ridge ring rises 3.5 degrees above its horizon, so the only sky it can ever
  // show is y 0.487-0.497 - the last 1.3% of this gradient. Sampling the
  // rendered frame row by row proved it: moving the blue stop from 0.45 to 0.47
  // changed the frame by nothing at all. Whatever that sliver holds IS the
  // flyover's sky, and v2 filled it with the palest, least saturated part of a
  // five-percent desaturating ramp (#a3bcc9 at 0.38, saturation 0.19; #ccc9b6
  // at 0.45, saturation 0.11) - the "flat cream wash" in the review.
  //
  // So the dust haze is authored as what it physically is: a shallow layer
  // sitting ON the horizon, about a degree thick, with real sky held down to
  // 0.49. A level player (who sees y 0.31-0.50) still gets a hazy horizon line;
  // the flyover gets sky.
  'range-midmorning': Object.freeze([
    [0, '#2f5f9e'],
    [0.16, '#3b73b0'],
    [0.32, '#4e8ac2'],
    [0.42, '#66a0d0'],
    [0.474, '#8fbcdc'],
    [0.492, '#b7c8cf'],
    [0.4985, '#e7d9ba'],
    [0.53, '#d6c092'],
    [0.7, '#b39a72'],
    [1, '#7d6c4e'],
  ] as const),
  // Owner 2026-08-30 (v2): Test2 - late golden hour over the hillside estate.
  // Same horizon-at-0.5 and ground-half discipline as range-midmorning above;
  // the lower half is lit travertine (test-maps-art.ts travertine base
  // 0xd8cbb4) so the warm bounce that reads on balustrade undersides, coping
  // and the pool-house eaves comes from the environment rather than from
  // tinting the flat ambient warm - which would also have warmed the shaded
  // side of every wall, the specific failure the extraction warns about.
  //
  // ART PASS 2026-08-30: same correction as range-midmorning above, for the
  // opposite reason. The amber ramp opened at 0.36 and the muddy transition
  // stop (#a1929e, saturation 0.08) sat in the middle of the band a level
  // player looks at, so the estate's sky graded through grey on its way to
  // gold. The gold is pulled into the last 10% - which is where a golden-hour
  // glow physically is, since the sun is 18 degrees up - and real evening blue
  // is held down to 0.40, so the arena finally has a cool half of the sky to
  // separate its warm surfaces against.
  // Same measured discipline as range-midmorning: this arena's flyover samples
  // y 0.44-0.50, so the whole cool half has to live below 0.44 to be seen at
  // all. It is worth the stop budget - the estate's surfaces are all warm, and
  // an entirely amber dome was leaving 56-72% of the frame's chroma weight in
  // one 10-degree hue bin.
  'estate-golden-hour': Object.freeze([
    [0, '#1d4a8c'],
    [0.16, '#2f5c9b'],
    [0.30, '#47709f'],
    [0.40, '#6b7f9c'],
    [0.462, '#a98a92'],
    [0.482, '#e39f6d'],
    [0.4985, '#ffcf90'],
    [0.53, '#e8c294'],
    [0.7, '#c2a87f'],
    [1, '#8a7657'],
  ] as const),
});

/**
 * Per-preset cloud fields baked into the backdrop so every backend (WebGPU -
 * including Firefox 141+, which ships WebGPU on Windows per HF-331 - and the
 * WebGL2 compatibility path alike) gets a real sky with clouds, not a flat
 * gradient.
 * Bands are vertical fractions of the texture (0 = zenith, 1 = horizon).
 */
export const SKY_BACKDROP_CLOUDS: Readonly<Record<SkyBackdropPreset, Readonly<{
  count: number;
  bandTop: number;
  bandBottom: number;
  rgb: [number, number, number];
  shadowRgb: [number, number, number];
  alpha: number;
  scale: number;
} | null>>> = Object.freeze({
  'sunset-farmland': Object.freeze({
    count: 34, bandTop: 0.18, bandBottom: 0.56,
    rgb: [255, 188, 142] as [number, number, number], shadowRgb: [74, 42, 91] as [number, number, number],
    alpha: 0.56, scale: 0.72,
  }),
  'industrial-night': Object.freeze({
    count: 16, bandTop: 0.2, bandBottom: 0.54,
    rgb: [72, 101, 128] as [number, number, number], shadowRgb: [8, 18, 34] as [number, number, number],
    alpha: 0.26, scale: 0.82,
  }),
  'airport-dawn': Object.freeze({
    count: 38, bandTop: 0.12, bandBottom: 0.55,
    rgb: [255, 255, 255] as [number, number, number], shadowRgb: [105, 140, 167] as [number, number, number],
    alpha: 0.66, scale: 0.68,
  }),
  'indoor-range': null,
  // Scattered trade-wind cumulus. The band is deliberately NARROW and the
  // count low: a player at eye level looks at roughly v=0.35-0.55 of the
  // equirect, so a wide dense band there covers the whole visible sky and the
  // gradient underneath becomes irrelevant. An earlier tuning ran 30 clouds
  // from 0.14 to 0.58 at alpha 0.62 and rendered a flat white sky - forcing
  // the gradient to pure red changed nothing on screen, which is how the
  // clouds were identified as the real cover.
  'jungle-golden-hour': Object.freeze({
    count: 13, bandTop: 0.08, bandBottom: 0.34,
    rgb: [255, 255, 252] as [number, number, number], shadowRgb: [88, 118, 152] as [number, number, number],
    alpha: 0.44, scale: 0.7,
  }),
  // Small, high, fast trade-wind cumulus - sparse so the sky stays open.
  'open-ocean-day': Object.freeze({
    count: 24, bandTop: 0.10, bandBottom: 0.46,
    rgb: [255, 255, 255] as [number, number, number], shadowRgb: [120, 156, 184] as [number, number, number],
    alpha: 0.58, scale: 0.54,
  }),
  // Test1. The brief says "a hard, clear sky", and v2 read that as clouds:null.
  // That is right OVERHEAD and wrong at the horizon: the two cameras that
  // matter both look at the low sky (a level player sees y 0.31-0.50, the menu
  // flyover only 0.487-0.497), so clouds:null left every frame anyone looks at
  // with an empty band - half of "the sky has nothing in it" in the review. A
  // distant cumulus line ALONG the horizon is what a desert range actually has
  // at mid-morning and it costs the brief nothing: the band is 0.462-0.488,
  // i.e. 1-3.5 degrees of elevation, so everything above 4 degrees stays hard
  // and clear. The small scale keeps them distant cloud rather than a deck, and
  // the shadow colour is cool and dark enough to read against the haze band
  // they sit on - white-on-cream was invisible.
  'range-midmorning': Object.freeze({
    count: 34, bandTop: 0.462, bandBottom: 0.488,
    rgb: [255, 251, 242] as [number, number, number], shadowRgb: [118, 132, 156] as [number, number, number],
    alpha: 0.5, scale: 0.3,
  }),
  // v2: the band was 0.16-0.50, so more than half of it sat above the visible
  // sky band (0.31-0.50 for a level camera) and the rest ran straight into the
  // horizon line. Pulled to 0.24-0.46 so the deck is where a player actually
  // looks, and re-coloured for a low key: warm lit tops, cool violet-grey
  // undersides rather than the previous grey-brown, so the cloud deck carries
  // the same warm-key/cool-sky separation as the surfaces below it.
  // Art pass 2026-08-30: 0.24-0.46 put the whole deck above the sliver of sky
  // the menu flyover can actually see (y 0.47-0.50, measured off the rendered
  // frame - this arena's ridge ring hides everything higher), so the preview
  // showed an empty amber band. Pulled to 0.44-0.488 at a smaller scale, which
  // is where both the flyover and a level player's low sky overlap, and the
  // count raised: a golden-hour sky whose only structure is a gradient is
  // exactly the plateau the extraction's sky roll-off item warns about.
  'estate-golden-hour': Object.freeze({
    count: 30, bandTop: 0.44, bandBottom: 0.488,
    rgb: [255, 214, 166] as [number, number, number], shadowRgb: [82, 78, 112] as [number, number, number],
    alpha: 0.5, scale: 0.36,
  }),
});

function skyRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x1_0000_0000;
  };
}

/**
 * Circumsolar aureole authoring (owner 2026-08-30, from the upstream technique
 * extraction's "analytic circumsolar aureole" item).
 *
 * The legacy `glowRadius` glow is a fixed-alpha two-stop radial blob whose size
 * is an arbitrary pixel count: it has no relationship to the arena's aerosol
 * load, and its 0.85 -> 0.32 -> 0 ramp piles everything from a few degrees out
 * to the cone edge onto one value, which is exactly the flat plateau a low sun
 * must not have. Presets that declare an `aureole` instead get the halo the
 * physics actually produces: the forward peak of Mie scattering, sampled as the
 * phase function's EXCESS over its own value at the cutoff so the term reaches
 * zero continuously at the cone edge instead of leaving a visible ring.
 *
 * - `reachDegrees` is a real angular radius. On a 2:1 equirectangular texture
 *   both axes carry the same degrees-per-pixel (width/360 == height/180), so a
 *   circle is correct to within the cos(latitude) azimuth stretch, ~5% for a
 *   sun 18 degrees up.
 * - `strength` scales with aerosol optical depth, i.e. with the arena's own
 *   `atmosphere.dust`.
 * - `anisotropy` is the Cornette-Shanks g: coarse dust is more forward-peaked
 *   (higher g, tighter halo) than fine haze.
 * - `coreDegrees` replaces the arbitrary `coreRadius`. The core is deliberately
 *   kept OUT of the aureole - it is the one part of the sky that is supposed to
 *   clip, and it must stay a hard-edged disc rather than the top of a ramp.
 */
export type SkyBackdropAureole = Readonly<{
  reachDegrees: number;
  coreDegrees: number;
  strength: number;
  anisotropy: number;
}>;

/**
 * Per-preset sun disc baked into the backdrop. x is a horizontal fraction of
 * the texture width; y is a vertical fraction where 0 = zenith, 0.5 = the
 * horizon and 1 = nadir (the equirectangular polar axis - a sun authored above
 * 0.5 is below the horizon and cannot be seen at all).
 */
export const SKY_BACKDROP_SUN: Readonly<Record<SkyBackdropPreset, Readonly<{
  x: number;
  y: number;
  coreRgb: [number, number, number];
  glowRgb: [number, number, number];
  coreRadius: number;
  glowRadius: number;
  aureole?: SkyBackdropAureole;
} | null>>> = Object.freeze({
  'sunset-farmland': Object.freeze({ x: 0.3, y: 0.5, coreRgb: [255, 236, 190] as [number, number, number], glowRgb: [255, 158, 64] as [number, number, number], coreRadius: 18, glowRadius: 92 }),
  'industrial-night': null,
  'airport-dawn': Object.freeze({ x: 0.72, y: 0.38, coreRgb: [255, 252, 240] as [number, number, number], glowRgb: [255, 240, 205] as [number, number, number], coreRadius: 14, glowRadius: 70 }),
  'indoor-range': null,
  // High and tight: a midday tropical sun is small and fierce, and its glow
  // stays close to white rather than bleeding amber across the whole sky.
  'jungle-golden-hour': Object.freeze({ x: 0.62, y: 0.24, coreRgb: [255, 253, 245] as [number, number, number], glowRgb: [214, 234, 250] as [number, number, number], coreRadius: 13, glowRadius: 66 }),
  // High and tight: midday sun over water is small, white and fierce.
  'open-ocean-day': Object.freeze({ x: 0.38, y: 0.22, coreRgb: [255, 255, 250] as [number, number, number], glowRgb: [214, 236, 255] as [number, number, number], coreRadius: 11, glowRadius: 58 }),
  // Owner 2026-08-30 (v2): both Test arenas' discs are placed AT the key light
  // rather than by eye, because arena-environment-ibl.ts bakes this texture
  // into scene.environment - a disc that disagrees with the directional light
  // puts the environment's brightest lobe on the opposite side of the sky from
  // the one casting the shadows.
  //
  // Derivation. Both arenas take blender-lighting.ts' non-Atomic sunPosition
  // [-62, 25, 38] (arenaLightingProfile has no test1/test2 entry), so the key
  // direction is (-0.7806, 0.3148, 0.4784).
  //   x = atan2(z, x) / 2pi + 0.5 = 2.5923 / 6.2832 + 0.5 = 0.913
  //   y = 1 - (asin(0.3148) / pi + 0.5)                   = 0.398  (18.4 deg up)
  // v1 had range-midmorning at y 0.20 (a 54-degree sun the shadows never
  // matched) and estate-golden-hour at y 0.62, which is 21.6 degrees BELOW the
  // horizon: its disc was invisible in game and its whole glow was baked into
  // the ground half of the IBL. See followUps - a genuinely mid-morning Test1
  // needs a per-arena sunPosition in blender-lighting.ts, which this pass does
  // not own; the disc is placed where the light actually is.
  'range-midmorning': Object.freeze({
    x: 0.913, y: 0.398,
    coreRgb: [255, 252, 240] as [number, number, number], glowRgb: [252, 234, 196] as [number, number, number],
    coreRadius: 12, glowRadius: 20,
    // dust 0.22: a dusty range has a bright, coarse-particle halo (high g,
    // tight forward peak) rather than a wide soft one.
    aureole: Object.freeze({ reachDegrees: 20, coreDegrees: 4, strength: 0.66, anisotropy: 0.8 }),
  }),
  'estate-golden-hour': Object.freeze({
    x: 0.913, y: 0.398,
    coreRgb: [255, 242, 208] as [number, number, number], glowRgb: [255, 190, 116] as [number, number, number],
    coreRadius: 17, glowRadius: 19,
    // dust 0.08: less aerosol, so a dimmer halo, but fine haze scatters over a
    // broader lobe (lower g) and the low warm key makes it read amber.
    aureole: Object.freeze({ reachDegrees: 22, coreDegrees: 5.2, strength: 0.52, anisotropy: 0.7 }),
  }),
});

/** Cornette-Shanks phase function; the analytic stand-in for the Mie forward lobe. */
function cornetteShanksPhase(cosTheta: number, anisotropy: number): number {
  const g2 = anisotropy * anisotropy;
  const denominator = Math.pow(Math.max(1e-6, 1 + g2 - 2 * anisotropy * cosTheta), 1.5);
  return ((1 - g2) * (1 + cosTheta * cosTheta)) / (2 * (2 + g2) * denominator);
}

/** Stops across the aureole cone. Eight resolves the near-sun knee without banding. */
const AUREOLE_GRADIENT_STOPS = 8;

/**
 * Draws the circumsolar halo as the phase function's excess over its value at
 * the cone edge, so the term is continuous where it ends. Deterministic: pure
 * arithmetic over the authored constants, no RNG.
 */
function paintAureole(
  context: CanvasRenderingContext2D,
  aureole: SkyBackdropAureole,
  rgb: readonly [number, number, number],
  cx: number,
  cy: number,
  pixelsPerDegree: number,
): void {
  const radius = aureole.reachDegrees * pixelsPerDegree;
  if (radius <= 0) return;
  const reachRadians = (aureole.reachDegrees * Math.PI) / 180;
  const peak = cornetteShanksPhase(1, aureole.anisotropy);
  const edge = cornetteShanksPhase(Math.cos(reachRadians), aureole.anisotropy);
  const span = Math.max(peak - edge, 1e-6);
  const [r, g, b] = rgb;
  const gradient = context.createRadialGradient(cx, cy, 0, cx, cy, radius);
  for (let stop = 0; stop < AUREOLE_GRADIENT_STOPS; stop += 1) {
    const offset = stop / (AUREOLE_GRADIENT_STOPS - 1);
    const excess = (cornetteShanksPhase(Math.cos(offset * reachRadians), aureole.anisotropy) - edge) / span;
    const alpha = aureole.strength * Math.max(0, excess);
    gradient.addColorStop(offset, `rgba(${r}, ${g}, ${b}, ${alpha.toFixed(4)})`);
  }
  context.fillStyle = gradient;
  context.beginPath();
  context.arc(cx, cy, radius, 0, Math.PI * 2);
  context.fill();
}

function paintSun(context: CanvasRenderingContext2D, preset: SkyBackdropPreset, width: number, height: number): void {
  const sun = SKY_BACKDROP_SUN[preset];
  if (!sun) return;
  const cx = sun.x * width;
  const cy = sun.y * height;
  const resolutionScale = width / 512;
  // An equirectangular panorama spans 360 degrees of azimuth across its width
  // and 180 of polar angle down its height, so a 2:1 texture has one
  // degrees-per-pixel for both axes.
  const pixelsPerDegree = width / 360;
  const [gr, gg, gb] = sun.glowRgb;
  if (sun.aureole) {
    paintAureole(context, sun.aureole, sun.glowRgb, cx, cy, pixelsPerDegree);
  } else {
    const glowRadius = sun.glowRadius * resolutionScale;
    const glow = context.createRadialGradient(cx, cy, 0, cx, cy, glowRadius);
    glow.addColorStop(0, `rgba(${gr}, ${gg}, ${gb}, 0.85)`);
    glow.addColorStop(0.4, `rgba(${gr}, ${gg}, ${gb}, 0.32)`);
    glow.addColorStop(1, `rgba(${gr}, ${gg}, ${gb}, 0)`);
    context.fillStyle = glow;
    context.beginPath();
    context.arc(cx, cy, glowRadius, 0, Math.PI * 2);
    context.fill();
  }
  const coreRadius = sun.aureole
    ? sun.aureole.coreDegrees * pixelsPerDegree
    : sun.coreRadius * resolutionScale;
  const [cr, cg, cb] = sun.coreRgb;
  const core = context.createRadialGradient(cx, cy, 0, cx, cy, coreRadius);
  core.addColorStop(0, `rgba(${cr}, ${cg}, ${cb}, 1)`);
  core.addColorStop(0.7, `rgba(${cr}, ${cg}, ${cb}, 0.9)`);
  core.addColorStop(1, `rgba(${cr}, ${cg}, ${cb}, 0)`);
  context.fillStyle = core;
  context.beginPath();
  context.arc(cx, cy, coreRadius, 0, Math.PI * 2);
  context.fill();
}

function paintNightDetails(context: CanvasRenderingContext2D, preset: SkyBackdropPreset, width: number, height: number): void {
  if (preset !== 'industrial-night') return;
  const random = skyRandom(8_611);
  // A soft Milky-Way band gives the night map large-scale structure without a
  // low-resolution panorama or a billboard edge.
  context.save();
  context.translate(width * 0.58, height * 0.2);
  context.rotate(-0.16);
  context.scale(1, 0.18);
  const galaxy = context.createRadialGradient(0, 0, 0, 0, 0, width * 0.43);
  galaxy.addColorStop(0, 'rgba(116, 145, 180, 0.16)');
  galaxy.addColorStop(0.42, 'rgba(72, 99, 137, 0.1)');
  galaxy.addColorStop(1, 'rgba(40, 58, 88, 0)');
  context.fillStyle = galaxy;
  context.beginPath();
  context.arc(0, 0, width * 0.43, 0, Math.PI * 2);
  context.fill();
  context.restore();
  for (let index = 0; index < 520; index += 1) {
    const x = random() * width;
    const y = random() * height * 0.53;
    const radius = 0.45 + random() * (index % 37 === 0 ? 1.8 : 0.9);
    const alpha = 0.28 + random() * 0.62;
    context.fillStyle = `rgba(218, 232, 255, ${alpha.toFixed(3)})`;
    context.beginPath();
    context.arc(x, y, radius, 0, Math.PI * 2);
    context.fill();
  }
}

function paintWrappedCloudPuff(
  context: CanvasRenderingContext2D,
  width: number,
  x: number,
  y: number,
  radius: number,
  horizontalScale: number,
  rotation: number,
  rgb: readonly [number, number, number],
  alpha: number,
): void {
  const [r, g, b] = rgb;
  for (const wrap of [-width, 0, width]) {
    const wrappedX = x + wrap;
    if (wrappedX + radius * horizontalScale < 0 || wrappedX - radius * horizontalScale > width) continue;
    context.save();
    context.translate(wrappedX, y);
    context.rotate(rotation);
    context.scale(horizontalScale, 1);
    const blob = context.createRadialGradient(0, 0, 0, 0, 0, radius);
    blob.addColorStop(0, `rgba(${r}, ${g}, ${b}, ${alpha.toFixed(3)})`);
    blob.addColorStop(0.58, `rgba(${r}, ${g}, ${b}, ${(alpha * 0.72).toFixed(3)})`);
    blob.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);
    context.fillStyle = blob;
    context.beginPath();
    context.arc(0, 0, radius, 0, Math.PI * 2);
    context.fill();
    context.restore();
  }
}

function paintClouds(context: CanvasRenderingContext2D, preset: SkyBackdropPreset, width: number, height: number): void {
  const config = SKY_BACKDROP_CLOUDS[preset];
  if (!config) return;
  const random = skyRandom(preset.length * 7919 + 13);
  const [r, g, b] = config.rgb;
  const sun = SKY_BACKDROP_SUN[preset];
  const resolutionScale = width / 512;
  for (let index = 0; index < config.count; index += 1) {
    const cx = random() * width;
    const cy = (config.bandTop + random() * (config.bandBottom - config.bandTop)) * height;
    const puffs = 7 + Math.floor(random() * 6);
    const baseRadius = (18 + random() * 30) * config.scale * resolutionScale;
    const bankRotation = (random() - 0.5) * 0.16;
    // Clouds nearer the sun pick up its warm light for a lit-edge look.
    const sunLift = sun ? Math.max(0, 1 - Math.hypot(cx - sun.x * width, cy - sun.y * height) / (sun.glowRadius * resolutionScale * 2.2)) : 0;
    for (let puff = 0; puff < puffs; puff += 1) {
      const px = cx + (random() - 0.5) * baseRadius * 3.4;
      const py = cy + (random() - 0.5) * baseRadius * 0.9;
      const radius = baseRadius * (0.5 + random() * 0.7);
      const density = config.alpha * (0.4 + random() * 0.6);
      const lr = Math.min(255, Math.round(r + (255 - r) * sunLift * 0.5));
      const lg = Math.min(255, Math.round(g + (255 - g) * sunLift * 0.35));
      const lb = Math.min(255, Math.round(b + (255 - b) * sunLift * 0.2));
      const horizontalScale = 1.25 + random() * 1.35;
      paintWrappedCloudPuff(
        context, width, px, py + radius * 0.18, radius * 1.04, horizontalScale, bankRotation,
        config.shadowRgb, density * 0.64,
      );
      paintWrappedCloudPuff(
        context, width, px, py - radius * 0.08, radius, horizontalScale, bankRotation,
        [lr, lg, lb], density,
      );
    }
  }
}

function configureEquirectangularTexture(texture: THREE.Texture, name: string): THREE.Texture {
  texture.name = name;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.mapping = THREE.EquirectangularReflectionMapping;
  // The equirectangular azimuth is periodic. Clamp-to-edge left a full
  // background triangle sampling one edge whenever the review camera crossed
  // the 0/1 longitude boundary, which read as a translucent wedge in both
  // renderer backends even though the source edge join itself was clean.
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  return texture;
}

function gradientTexture(preset: SkyBackdropPreset): THREE.Texture {
  const { width, height } = SKY_BACKDROP_TEXTURE_SIZE;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Sky backdrop requires a 2D context');
  const gradient = context.createLinearGradient(0, 0, 0, height);
  for (const [offset, css] of SKY_BACKDROP_GRADIENTS[preset]) gradient.addColorStop(offset, css);
  context.fillStyle = gradient;
  context.fillRect(0, 0, width, height);
  paintNightDetails(context, preset, width, height);
  paintSun(context, preset, width, height);
  paintClouds(context, preset, width, height);
  return configureEquirectangularTexture(
    new THREE.CanvasTexture(canvas),
    `pass66-sky-backdrop-${preset}`,
  );
}

const backdropCache = new Map<SkyBackdropPreset, THREE.Texture>();
const generatedSkyTextures = new Map<SkyBackdropPreset, THREE.Texture>();
const generatedSkyRequests = new Map<SkyBackdropPreset, Promise<THREE.Texture | null>>();
let backdropLifetime = 0;
const sceneBackdropAdmissions = new WeakMap<THREE.Scene, Readonly<{
  application: number;
  settled: Promise<SkyBackdropStatus>;
}>>();

function sceneBackdropStatus(scene: THREE.Scene): SkyBackdropStatus {
  const status = scene.userData.pass66SkyBackdropStatus;
  return status === 'asset-loading' || status === 'asset-ready' || status === 'procedural-fallback'
    ? status
    : 'procedural-ready';
}

export function skyBackdropPreset(preset: string): SkyBackdropPreset {
  return preset === 'sunset-farmland' || preset === 'industrial-night'
    || preset === 'airport-dawn' || preset === 'indoor-range'
    || preset === 'jungle-golden-hour' || preset === 'open-ocean-day'
    // Owner 2026-08-30: Test1/Test2 daylight presets, both authored procedural.
    || preset === 'range-midmorning' || preset === 'estate-golden-hour'
    ? preset
    : 'airport-dawn';
}

export function skyBackdropAssetForPreset(preset: string): string | null {
  const resolved = skyBackdropPreset(preset);
  if (resolved === 'sunset-farmland') return ATOMIC_ACRES_GENERATED_SKY_ASSET_URL;
  if (resolved === 'industrial-night') return RUSTWORKS_GENERATED_SKY_ASSET_URL;
  if (resolved === 'airport-dawn') return TERMINAL_GENERATED_SKY_ASSET_URL;
  // Owner 2026-08-30 (v2): range-midmorning and estate-golden-hour no longer
  // substitute the terminal airport-dawn panorama. The substitution meant the
  // Test1/Test2 procedural presets were authored, applied, and then REPLACED a
  // few frames later by one shared clear-blue dawn dome - so neither arena's
  // authored time of day ever reached the screen, and (because
  // arena-environment-ibl.ts PMREMs scene.background) neither arena's ambient
  // or IBL matched its own sun either. High Seas already ships a fully
  // procedural sky this way (open-ocean-day resolves to null here). A bespoke
  // generated panorama for each may still land later; until it exists, the
  // authored preset is the better answer than another arena's.
  return null;
}

function requestGeneratedSkyTexture(
  preset: SkyBackdropPreset,
  assetUrl: string,
): Promise<THREE.Texture | null> {
  const loaded = generatedSkyTextures.get(preset);
  if (loaded) return Promise.resolve(loaded);
  const pending = generatedSkyRequests.get(preset);
  if (pending) return pending;
  const requestLifetime = backdropLifetime;
  let request: Promise<THREE.Texture | null>;
  request = new Promise((resolve) => {
    try {
      new THREE.ImageLoader().load(
        assetUrl,
        (image) => {
          const texture = new THREE.Texture(image);
          configureEquirectangularTexture(texture, `pass66-generated-sky-backdrop-${preset}`);
          // All sampler/mapping state is final before this single upload
          // version is exposed to either renderer backend. TextureLoader
          // marks its placeholder once internally and our former onLoad
          // configuration marked it a second time; a WebGPU backend could
          // observe both versions and reject the duplicate initialization.
          texture.needsUpdate = true;
          if (requestLifetime !== backdropLifetime) {
            texture.dispose();
            resolve(null);
            return;
          }
          generatedSkyTextures.set(preset, texture);
          resolve(texture);
        },
        undefined,
        () => resolve(null),
      );
    } catch {
      resolve(null);
    }
  });
  generatedSkyRequests.set(preset, request);
  void request.then(() => {
    if (generatedSkyRequests.get(preset) === request) generatedSkyRequests.delete(preset);
  });
  return request;
}

/**
 * Applies the arena's procedural sky immediately on every renderer backend.
 * Each outdoor arena then admits its selected high-detail source asynchronously.
 * A failed or stale decode leaves the procedural CanvasTexture in place, so sky
 * enhancement can never block arena admission or replace the frame with white.
 */
export function applySkyBackdrop(
  scene: THREE.Scene,
  preset: string,
  recordSelectedAssetRequest?: (url: string) => void,
): THREE.Texture {
  const resolved = skyBackdropPreset(preset);
  let texture = backdropCache.get(resolved);
  if (!texture) {
    texture = gradientTexture(resolved);
    backdropCache.set(resolved, texture);
  }
  scene.background = texture;
  scene.userData.pass66SkyBackdropPreset = resolved;
  const application = Number(scene.userData.pass66SkyBackdropApplication ?? 0) + 1;
  scene.userData.pass66SkyBackdropApplication = application;
  scene.userData.pass66SkyBackdropStatus = 'procedural-ready' satisfies SkyBackdropStatus;
  scene.userData.pass66SkyBackdropSource = 'procedural-canvas';
  scene.userData.pass66SkyBackdropAssetUrl = null;
  sceneBackdropAdmissions.delete(scene);

  const assetUrl = skyBackdropAssetForPreset(resolved);
  if (assetUrl) {
    scene.userData.pass66SkyBackdropStatus = 'asset-loading' satisfies SkyBackdropStatus;
    scene.userData.pass66SkyBackdropAssetUrl = assetUrl;
    recordSelectedAssetRequest?.(assetUrl);
    const settled = requestGeneratedSkyTexture(resolved, assetUrl).then((loaded): SkyBackdropStatus => {
      if (scene.userData.pass66SkyBackdropApplication !== application
        || scene.userData.pass66SkyBackdropPreset !== resolved) return sceneBackdropStatus(scene);
      if (!loaded) {
        scene.userData.pass66SkyBackdropStatus = 'procedural-fallback' satisfies SkyBackdropStatus;
        return 'procedural-fallback';
      }
      scene.background = loaded;
      scene.userData.pass66SkyBackdropStatus = 'asset-ready' satisfies SkyBackdropStatus;
      scene.userData.pass66SkyBackdropSource = 'generated-equirectangular-webp';
      return 'asset-ready';
    });
    sceneBackdropAdmissions.set(scene, Object.freeze({ application, settled }));
  }
  return texture;
}

/**
 * Seals the selected backdrop before native-WebGPU presentation prewarm. Each
 * generated image is local and normally settles immediately; the bound prevents
 * a corrupt/stalled decode from blocking map admission. On timeout the current
 * application is invalidated, so a late decode may populate the shared cache
 * for a later map switch but cannot mutate the already-compiled live scene.
 */
export async function waitForSkyBackdropAdmission(
  scene: THREE.Scene,
  timeoutMs = SKY_BACKDROP_WEBGPU_ADMISSION_TIMEOUT_MS,
): Promise<SkyBackdropStatus> {
  const admission = sceneBackdropAdmissions.get(scene);
  if (!admission) return sceneBackdropStatus(scene);
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) return admission.settled;

  let timeout: ReturnType<typeof setTimeout> | undefined;
  const outcome = await Promise.race([
    admission.settled.then((status) => Object.freeze({ timedOut: false as const, status })),
    new Promise<Readonly<{ timedOut: true; status: SkyBackdropStatus }>>((resolve) => {
      timeout = setTimeout(() => resolve(Object.freeze({ timedOut: true, status: 'procedural-fallback' })), timeoutMs);
    }),
  ]);
  if (timeout !== undefined) clearTimeout(timeout);
  if (!outcome.timedOut) return outcome.status;

  if (scene.userData.pass66SkyBackdropApplication === admission.application) {
    // Bump the application generation before the outstanding request settles.
    // Its completion can warm the process cache, but the stale continuation is
    // now forbidden from replacing this scene's admitted procedural backdrop.
    scene.userData.pass66SkyBackdropApplication = admission.application + 1;
    scene.userData.pass66SkyBackdropStatus = 'procedural-fallback' satisfies SkyBackdropStatus;
    scene.userData.pass66SkyBackdropSource = 'procedural-canvas';
  }
  if (sceneBackdropAdmissions.get(scene) === admission) sceneBackdropAdmissions.delete(scene);
  return 'procedural-fallback';
}

/** Terminal teardown only; never call while a frame may still sample these. */
export function disposeSkyBackdrops(): void {
  backdropLifetime += 1;
  generatedSkyRequests.clear();
  for (const texture of generatedSkyTextures.values()) texture.dispose();
  generatedSkyTextures.clear();
  for (const texture of backdropCache.values()) texture.dispose();
  backdropCache.clear();
}
