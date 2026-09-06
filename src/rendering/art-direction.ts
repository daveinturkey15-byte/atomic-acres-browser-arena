/**
 * Lane L — per-arena ART DIRECTION (the routed one).
 *
 * WHY THIS EXISTS. Two passes of grading work landed and the owner could not
 * see either of them, because every layer that could have differentiated the
 * arenas converged on the same values:
 *   - `arenas/shared.ts` hands every arena the identical linear grade
 *     (contrast 1.025 / saturation 1.02 / teal-orange tints),
 *   - `grade-profile.ts` varies by GRAPHICS PRESET, not by place, and keeps
 *     slopes within 2% of neutral,
 *   - `src/arena-grade-identity.ts` (HF-363) authored per-arena values but has
 *     ZERO production consumers — a catalog nothing imports is a look nothing
 *     ships.
 * This module is the opinionated replacement AND it is routed: the filmic
 * grade chain composes it into its live uniforms (see
 * `FilmicGradeChainHandle.setArenaArtDirection`) and the Pass 64 scene
 * assembler drives its linear grade and atmosphere mood from it. Every arena
 * must read as a different PLACE within the first five seconds of play.
 *
 * COMPOSITION MODEL. The graphics preset keeps owning fidelity (bloom radius,
 * grain, transfer shoulder); this module owns PLACE (hue, separation,
 * atmosphere). `composeArtDirectedProfile(profile, direction)` merges the two
 * into one frozen profile the chain applies — so nothing gameplay-visible
 * varies by render profile: the same arena direction is composed over
 * performance, quality and max alike.
 *
 * COMBAT SAFETY (enforced by `assertArtDirectionSafety`, called for the whole
 * catalog at module init — fail closed, not advisory):
 *   - lift (CDL offset add) stays within [0, +0.006]: the black point may be
 *     warmed or lifted a hair, never crushed below the authored floor;
 *   - gain stays within [0.82, 1.18] and gamma within [0.92, 1.10] so no
 *     channel is driven far enough to erase silhouette separation;
 *   - composed midtone contrast is clamped to the chain's proven-monotonic
 *     bound (<= 0.3, local slope >= 0.86);
 *   - composed crosstalk stays within [-0.15, 0.5]: negative values push
 *     channel separation (energy-preserving saturation) but never far enough
 *     to clip readable hue ramps;
 *   - bloom thresholds may only be scaled UP (>= 1.0x) and never drop below
 *     1.02 linear — true emitters only, no washed sightlines;
 *   - display vignette is capped: `DISPLAY_VIGNETTE_MAXIMUM` bounds the
 *     composed strength, so the screen periphery enemies enter from keeps at
 *     least ~79% of its luminance at the deepest corner.
 */

import { ARENA_IDS, type ArenaId } from '../arena-identity';
import type { FrozenFilmicGradeProfile } from './grade-profile';

export type Rgb3 = readonly [number, number, number];

export type ArenaArtDirection = Readonly<{
  id: ArenaId;
  /** One-line author intent — what the first five seconds must say. */
  brief: string;
  /** Linear-HDR lift/gamma/gain, composed onto the profile's ASC CDL. */
  cdl: Readonly<{
    /** Multiplies CDL slope per channel. */
    gain: Rgb3;
    /** Adds to CDL offset per channel (display-referred-safe, tiny). */
    lift: Rgb3;
    /** Multiplies CDL power per channel. */
    gamma: Rgb3;
  }>;
  /**
   * Scene-referred saturation curve: multiplies the arena's authored linear
   * saturation (mix from Rec.709 luma) before the tone map.
   */
  saturationScale: number;
  /** Multiplies the authored linear contrast (pivot 0.5, pre-tone-map). */
  contrastScale: number;
  /**
   * Added to the profile's channel-crosstalk strength. Negative extrapolates
   * away from the neighbour-channel average — an energy-preserving saturation
   * push; positive bleeds hue toward it — an industrial haze desaturation.
   */
  crosstalkDelta: number;
  /** Display split tone — the arena's hue identity, replaces shared teal/amber. */
  splitTone: Readonly<{
    shadowTint: number;
    highlightTint: number;
    /** Multiplies the profile's splitToneStrength (composed value <= 1). */
    strengthScale: number;
    shadowBalance: number;
    highlightBalance: number;
  }>;
  /** Added to the profile's midtone contrast; composed value clamped <= 0.3. */
  midtoneContrastDelta: number;
  /** Vignette character: authored base + scale over the player's setting. */
  vignette: Readonly<{ base: number; settingScale: number }>;
  /** Bloom identity. thresholdScale >= 1 — thresholds may only move UP. */
  bloom: Readonly<{ intensityScale: number; thresholdScale: number }>;
  /**
   * HF-536 night-lighting — the two tone-curve shapers an arena may author.
   *
   * Optional: an arena that omits it composes exactly as it does today, so
   * this field cannot move any shipped arena's picture by existing.
   *
   * BOTH DIRECTIONS ARE ONE-WAY, and that is the whole combat-safety argument:
   *
   * - `toeStrengthScale >= 1`. Stage 8 is a pure ADD of
   *   `toeFloor * toeStrength * shadowMask` (`applyDisplayToe`), so scaling it
   *   up can only RAISE a shadow pixel. Nothing that renders today can get
   *   darker, and `NEWLY_BLACK` can only fall. The composed lift is clamped to
   *   `MAXIMUM_COMPOSED_DISPLAY_TOE_LIFT`, which is the 5%-display ceiling the
   *   grade-profile combat envelope already states in prose.
   * - `shoulderStartScale <= 1`. Stage 6 pre-conditions the highlights before
   *   the ACES transform; lowering where the shoulder starts hands ACES a
   *   compressed range instead of a clipped one, which RECOVERS separation
   *   between a blown sky and the sunlit wall in front of it. Raising it is
   *   refused because that would push more of the frame into the clip.
   *
   * Measured reason nuketown2 needs them (root-captures/forge-final, 29
   * stations, tod=authored, 6000 ms hold): the composed display toe on the
   * quality profile is `0.035 * 0.14 = 0.0049`, i.e. **1.25 of 255** — a toe
   * stage that lifts by less than one 8-bit step, against a value plan that
   * asks for a shadow floor of >= 10. And the sky is at p50 208-219 with the
   * sunlit siding at p50 203, i.e. sky and wall are the same value because
   * both sit on the ACES shoulder.
   */
  tone?: Readonly<{
    /** Multiplies the profile's display toe strength. >= 1 (lift only). */
    toeStrengthScale: number;
    /** Multiplies the profile's highlight shoulder start. <= 1 (compress only). */
    shoulderStartScale: number;
  }>;
  /** Atmosphere particle mood: mist/smoke/dust tint pairs + density scale. */
  atmosphere: Readonly<{
    mistNear: number; mistFar: number;
    smokeNear: number; smokeFar: number;
    dustNear: number; dustFar: number;
    /** Multiplies authored mist/smoke/dust strengths; existing opacity
     *  ceilings in the scene assembler still apply on top. */
    density: number;
  }>;
}>;

/** Hard cap on the composed display vignette strength (pre-VIGNETTE_GAIN). */
export const DISPLAY_VIGNETTE_MAXIMUM = 0.5;

/** Composed bloom threshold floor — strictly above 1.0 linear, fail-closed. */
export const MINIMUM_COMPOSED_BLOOM_THRESHOLD = 1.02;

/** Chain-proven monotonicity bound for the display midtone contrast. */
export const MAXIMUM_COMPOSED_MIDTONE_CONTRAST = 0.3;

/**
 * HF-536 — ceiling on the composed display toe lift, in display-referred
 * units (1.0 = 255). The grade-profile combat envelope already states the rule
 * in prose ("Shadow toe never lifts blacks above ~5% display luminance"); this
 * is that sentence made executable now that an arena can scale the toe.
 * 0.05 display = 12.75 of 255, comfortably above the R26 shadow floor of 10
 * and far below anything that could fog a sightline.
 */
export const MAXIMUM_COMPOSED_DISPLAY_TOE_LIFT = 0.05;

/**
 * HF-536 — floor on the composed highlight shoulder start, in linear HDR.
 * Below this the shoulder would begin inside the diffuse midtones, which is
 * where surface modelling lives; the stage is a highlight conditioner, not a
 * global contrast reducer.
 */
export const MINIMUM_COMPOSED_HIGHLIGHT_SHOULDER_START = 0.45;

/** Bounds for the linear scene grade after composition. */
export const SCENE_SATURATION_BOUNDS = Object.freeze({ minimum: 0.6, maximum: 1.45 });
export const SCENE_CONTRAST_BOUNDS = Object.freeze({ minimum: 0.9, maximum: 1.18 });

export const ART_DIRECTION_SAFETY_BOUNDS = Object.freeze({
  gain: Object.freeze({ minimum: 0.82, maximum: 1.18 }),
  gamma: Object.freeze({ minimum: 0.92, maximum: 1.1 }),
  lift: Object.freeze({ minimum: 0, maximum: 0.006 }),
  crosstalkDelta: Object.freeze({ minimum: -0.13, maximum: 0.08 }),
  composedCrosstalk: Object.freeze({ minimum: -0.15, maximum: 0.5 }),
  saturationScale: Object.freeze({ minimum: 0.85, maximum: 1.3 }),
  contrastScale: Object.freeze({ minimum: 0.95, maximum: 1.14 }),
  splitToneStrengthScale: Object.freeze({ minimum: 0.4, maximum: 1.6 }),
  midtoneContrastDelta: Object.freeze({ minimum: 0, maximum: 0.1 }),
  vignetteBase: Object.freeze({ minimum: 0, maximum: 0.24 }),
  vignetteSettingScale: Object.freeze({ minimum: 0.5, maximum: 1.5 }),
  bloomIntensityScale: Object.freeze({ minimum: 0.75, maximum: 1.35 }),
  bloomThresholdScale: Object.freeze({ minimum: 1, maximum: 1.3 }),
  atmosphereDensity: Object.freeze({ minimum: 0.6, maximum: 1.35 }),
  // HF-536. Lift-only and compress-only by construction; see the `tone` field.
  toeStrengthScale: Object.freeze({ minimum: 1, maximum: 14 }),
  shoulderStartScale: Object.freeze({ minimum: 0.5, maximum: 1 }),
});

function assertWithin(
  arena: ArenaId,
  label: string,
  value: number,
  bounds: Readonly<{ minimum: number; maximum: number }>,
): void {
  if (!Number.isFinite(value) || value < bounds.minimum || value > bounds.maximum) {
    throw new Error(
      `Art direction combat-safety violation in '${arena}': ${label} = ${value} escapes [${bounds.minimum}, ${bounds.maximum}]`,
    );
  }
}

/** Fail-closed validation. Runs for the whole catalog at module init. */
export function assertArtDirectionSafety(direction: ArenaArtDirection): void {
  for (let channel = 0; channel < 3; channel += 1) {
    assertWithin(direction.id, `cdl.gain[${channel}]`, direction.cdl.gain[channel], ART_DIRECTION_SAFETY_BOUNDS.gain);
    assertWithin(direction.id, `cdl.gamma[${channel}]`, direction.cdl.gamma[channel], ART_DIRECTION_SAFETY_BOUNDS.gamma);
    assertWithin(direction.id, `cdl.lift[${channel}]`, direction.cdl.lift[channel], ART_DIRECTION_SAFETY_BOUNDS.lift);
  }
  assertWithin(direction.id, 'crosstalkDelta', direction.crosstalkDelta, ART_DIRECTION_SAFETY_BOUNDS.crosstalkDelta);
  assertWithin(direction.id, 'saturationScale', direction.saturationScale, ART_DIRECTION_SAFETY_BOUNDS.saturationScale);
  assertWithin(direction.id, 'contrastScale', direction.contrastScale, ART_DIRECTION_SAFETY_BOUNDS.contrastScale);
  assertWithin(
    direction.id,
    'splitTone.strengthScale',
    direction.splitTone.strengthScale,
    ART_DIRECTION_SAFETY_BOUNDS.splitToneStrengthScale,
  );
  assertWithin(direction.id, 'splitTone.shadowBalance', direction.splitTone.shadowBalance, { minimum: 0.2, maximum: 0.7 });
  assertWithin(direction.id, 'splitTone.highlightBalance', direction.splitTone.highlightBalance, { minimum: 0.3, maximum: 0.8 });
  assertWithin(
    direction.id,
    'midtoneContrastDelta',
    direction.midtoneContrastDelta,
    ART_DIRECTION_SAFETY_BOUNDS.midtoneContrastDelta,
  );
  assertWithin(direction.id, 'vignette.base', direction.vignette.base, ART_DIRECTION_SAFETY_BOUNDS.vignetteBase);
  assertWithin(
    direction.id,
    'vignette.settingScale',
    direction.vignette.settingScale,
    ART_DIRECTION_SAFETY_BOUNDS.vignetteSettingScale,
  );
  assertWithin(direction.id, 'bloom.intensityScale', direction.bloom.intensityScale, ART_DIRECTION_SAFETY_BOUNDS.bloomIntensityScale);
  assertWithin(direction.id, 'bloom.thresholdScale', direction.bloom.thresholdScale, ART_DIRECTION_SAFETY_BOUNDS.bloomThresholdScale);
  assertWithin(direction.id, 'atmosphere.density', direction.atmosphere.density, ART_DIRECTION_SAFETY_BOUNDS.atmosphereDensity);
  if (direction.tone) {
    assertWithin(
      direction.id,
      'tone.toeStrengthScale',
      direction.tone.toeStrengthScale,
      ART_DIRECTION_SAFETY_BOUNDS.toeStrengthScale,
    );
    assertWithin(
      direction.id,
      'tone.shoulderStartScale',
      direction.tone.shoulderStartScale,
      ART_DIRECTION_SAFETY_BOUNDS.shoulderStartScale,
    );
  }
}

function frozen(direction: ArenaArtDirection): ArenaArtDirection {
  return Object.freeze({
    ...direction,
    cdl: Object.freeze({
      gain: Object.freeze([...direction.cdl.gain] as const) as Rgb3,
      lift: Object.freeze([...direction.cdl.lift] as const) as Rgb3,
      gamma: Object.freeze([...direction.cdl.gamma] as const) as Rgb3,
    }),
    splitTone: Object.freeze({ ...direction.splitTone }),
    vignette: Object.freeze({ ...direction.vignette }),
    bloom: Object.freeze({ ...direction.bloom }),
    atmosphere: Object.freeze({ ...direction.atmosphere }),
    ...(direction.tone ? { tone: Object.freeze({ ...direction.tone }) } : {}),
  });
}

/**
 * The catalog. Values are deliberately BOLD — the shared look these replace
 * was pinned within 2% of neutral on every axis and the owner read six arenas
 * as one arena. Every entry stays inside the safety bounds above.
 */
export const ARENA_ART_DIRECTIONS: Readonly<Record<ArenaId, ArenaArtDirection>> = Object.freeze({
  // Far Cry 1 brief: cyan sea, hot white sun, lush oversaturated green.
  // The island must look like a postcard the second the deploy fades.
  'farcrysis': frozen({
    id: 'farcrysis',
    brief: 'Saturated tropical paradise — cyan water, hot sun, jungle greens that hum.',
    cdl: {
      // Green dominant with blue kept alive — lush canopy AND cyan water in
      // one cast. Red is held back, which is what stops the island reading as
      // a greener atomic-acres.
      // Pass 79 separation pass: green up 1.12 -> 1.17 and red down
      // 1.03 -> 0.98. HUE ONLY — contrast, lift, gamma and saturation are the
      // values the capture rounds above settled on and are untouched, because
      // every failure recorded for this arena was a CONTRAST failure. The
      // brief already says hue carries this island, so hue is where the
      // separation is bought.
      gain: [0.98, 1.17, 1.02],
      // The black point is LIFTED, not crushed. First capture round: at
      // contrast 1.08 the mid-ground treeline collapsed to silhouette (shadow
      // mass +4.3 points, 5th-percentile luma -19 steps) and a defender in the
      // canopy stopped being findable. Hue carries this island, not contrast.
      lift: [0.004, 0.004, 0.002],
      gamma: [0.97, 0.94, 1.01],
    },
    saturationScale: 1.29,
    contrastScale: 1.02,
    crosstalkDelta: -0.12,
    splitTone: {
      shadowTint: 0x0a6a5e,      // deep lagoon cyan-green under the canopy
      highlightTint: 0xfff0b0,   // hot noon sun on sand
      // CORRECTION ROUND, MEASURED: 1.45 gave the frame back its warm/cool
      // separation and also took global HSV saturation from 11.5% over the
      // boards to 18.3% over — the wrong direction on the one axis finding 3
      // says is already the problem (plastic vegetation). 1.25 keeps most of
      // the separation and hands back roughly a third of that regression; the
      // sunlit R-B gain is safe to trade here because the CPU chain model
      // measured split-tone strength as NEARLY INERT on warmth (sweeping 1.0
      // to 1.6 moves the sunlit probe's R-B by 0.4 of 255) — the warmth came
      // from the searched gain, not from here.
      strengthScale: 1.25,
      shadowBalance: 0.5,
      highlightBalance: 0.44,
    },
    midtoneContrastDelta: 0.03,
    vignette: { base: 0.05, settingScale: 1 },
    bloom: { intensityScale: 1.1, thresholdScale: 1 },
    atmosphere: {
      mistNear: 0x9fd8d8, mistFar: 0xeafaf0,
      smokeNear: 0x33534b, smokeFar: 0x8fb5a5,
      dustNear: 0xf0e2a8, dustFar: 0xfff7d6,
      density: 0.85,
    },
  }),
  // Crisp maritime steel. The hull cast is TEAL — green AND blue lifted, red
  // cut — deliberately NOT the indigo skyline-terminal owns: the first capture
  // round measured those two arenas 1.7/255 apart on the probe set, which is
  // exactly the "everything looks the same" the owner reported. Teal-vs-indigo
  // hull cast plus warm-vs-cold practicals is what pulls them apart.
  'high-seas': frozen({
    id: 'high-seas',
    brief: 'Crisp maritime steel-and-teal, golden practicals against cold sea light.',
    cdl: {
      // Pass 79 separation pass: red down 0.93 -> 0.88, teal untouched. The
      // recorded failure here was contrast crushing the deck shadows, so the
      // extra hull-cast separation is taken out of RED — which the maritime
      // brief does not use — and never out of the black point.
      gain: [0.88, 1.05, 1.07],
      // First capture round at contrast 1.12: shadow mass +19.5 points and the
      // 5th-percentile luma -16 steps. Most of that was the ocean going deep
      // (which is the look), but the deck shadows went with it, so the linear
      // contrast comes back down and the black point is lifted instead.
      lift: [0.006, 0.006, 0.006],
      gamma: [1.05, 0.99, 0.97],
    },
    // Second capture round: pulling the linear contrast down to protect the
    // deck shadows also pulled the whole identity down to a 3.9-step shift.
    // Saturation buys the look back without touching the black point — it
    // scales colour, not darkness.
    saturationScale: 1.22,
    contrastScale: 1.03,
    crosstalkDelta: -0.07,
    splitTone: {
      shadowTint: 0x0b3b42,      // deep sea-teal below decks (green-leaning)
      highlightTint: 0xffbc5e,   // golden cabin practicals
      strengthScale: 1.55,
      // The teal reaches UP into the midtones (high shadowBalance) and the
      // practicals reach DOWN (low highlightBalance): the whole frame is split
      // between them, which is the maritime read.
      shadowBalance: 0.5,
      highlightBalance: 0.44,
    },
    midtoneContrastDelta: 0.04,
    vignette: { base: 0.09, settingScale: 1 },
    bloom: { intensityScale: 1.15, thresholdScale: 1 },
    atmosphere: {
      mistNear: 0x8fb8c4, mistFar: 0xdfeef2,
      smokeNear: 0x2c3e46, smokeFar: 0x7f96a0,
      dustNear: 0xcfe0e6, dustFar: 0xf2fbff,
      density: 0.9,
    },
  }),
  // Warm pastoral americana: cream sunlight, peach highlights, dusk-violet
  // shade — a 1950s postcard suburb a heartbeat before the test.
  'atomic-acres': frozen({
    id: 'atomic-acres',
    brief: 'Warm pastoral americana — cream sun, peach highlights, dusk-violet shade.',
    cdl: {
      // CREAM, not orange: red and green together, blue withdrawn. The green
      // lift is what stops this reading as a paler rustworks-1v1 — the two
      // warm arenas measured 2.1/255 apart before this pass.
      // Pass 79 separation pass: green now leads red (1.09 vs 1.04) instead of
      // matching it, which is the same axis the note above names, pushed one
      // step further. Blue stays withdrawn at 0.9; the softest-midtone
      // contract below is untouched.
      gain: [1.04, 1.09, 0.9],
      lift: [0.004, 0.003, 0.001],
      gamma: [0.96, 0.97, 1.05],
    },
    saturationScale: 1.22,
    contrastScale: 1,
    // Pushed to the edge of the safe band: with rustworks-1v1's haze crosstalk
    // reduced (see its note), this is what keeps the two warm arenas apart.
    crosstalkDelta: -0.12,
    splitTone: {
      shadowTint: 0x4d3a7a,      // dusk VIOLET under the porches (red+blue)
      highlightTint: 0xffdcac,   // late-sun cream-peach
      strengthScale: 1.55,
      shadowBalance: 0.52,
      highlightBalance: 0.46,
    },
    // The SOFTEST midtones of the six: a pastel postcard is defined as much by
    // the contrast it refuses as by its hue.
    midtoneContrastDelta: 0.02,
    vignette: { base: 0.12, settingScale: 1 },
    bloom: { intensityScale: 1.05, thresholdScale: 1 },
    atmosphere: {
      mistNear: 0xd8c4a4, mistFar: 0xffe9c8,
      smokeNear: 0x4a3b3a, smokeFar: 0xa88d78,
      dustNear: 0xe8c088, dustFar: 0xffe2b0,
      density: 1.15,
    },
  }),
  // Cool corporate glass: hard clean planes, blue-cyan cast, neon accents
  // allowed to bloom hotter than anywhere else.
  'skyline-terminal': frozen({
    id: 'skyline-terminal',
    brief: 'Cool corporate glass and neon — hard blue-cyan planes, hot accent emitters.',
    cdl: {
      // Blue-dominant with green CUT — the axis that separates corporate glass
      // from high-seas' teal, where green is lifted instead.
      gain: [0.92, 0.96, 1.16],
      lift: [0.004, 0.004, 0.006],
      gamma: [1.05, 1.02, 0.94],
    },
    saturationScale: 1.02,
    // Two capture rounds on this one. 1.12 pushed the concourse service
    // shadows toward black; 1.06 still cost 25 steps of 5th-percentile luma
    // with shadow mass up 12 points. The glass-and-neon identity is carried
    // ENTIRELY by hue and the split tone, so the linear contrast goes to
    // neutral and the black point is lifted.
    contrastScale: 1,
    crosstalkDelta: -0.06,
    splitTone: {
      shadowTint: 0x252a6b,      // indigo-violet service corridors
      highlightTint: 0xc6ecff,   // glass-and-neon cyan white
      strengthScale: 1.45,
      shadowBalance: 0.5,
      highlightBalance: 0.42,
    },
    midtoneContrastDelta: 0.05,
    vignette: { base: 0.07, settingScale: 1 },
    bloom: { intensityScale: 1.25, thresholdScale: 1 },
    atmosphere: {
      mistNear: 0x9fb4d4, mistFar: 0xdfe9ff,
      smokeNear: 0x2a3350, smokeFar: 0x8494b8,
      dustNear: 0xb8c8e8, dustFar: 0xe8f2ff,
      density: 0.85,
    },
  }),
  // Rust-orange industrial haze: sodium-orange practicals against cold night
  // steel, mist carrying the rust. Shadows stay LIFTED — this is the one true
  // night map, and the first capture round measured its shadow mass dropping
  // from mean 15/255 to 7.6/255 under a 1.08 linear contrast scale; a night
  // arena gets its identity from hue and haze, never from extra contrast.
  'rustworks-1v1': frozen({
    id: 'rustworks-1v1',
    brief: 'Rust-orange industrial haze — sodium glow on cold night steel.',
    cdl: {
      // Sodium orange: red hard up, green held, blue hard down. Against
      // atomic-acres' cream (green lifted WITH red) this is the separating
      // axis, and the cold blue-cyan shadow tint is the other half of it.
      // Third capture round. A 0.84 blue gain made the rig rusty by draining
      // the blue out of the ENTIRE frame, and the open ocean — the one thing
      // this arena already had — went from teal to flat grey-mauve. The blue
      // cut is eased and the sodium moves into the split-tone HIGHLIGHTS,
      // which land on the lit rig and leave the dark sea to its cold shadow
      // tint. Warmth on the metal, not on the water.
      // Pass 79 separation pass: red 1.14 -> 1.17 and green 0.98 -> 0.95.
      // BLUE IS DELIBERATELY LEFT AT 0.91 — the third capture round above
      // measured 0.84 draining the open ocean from teal to grey-mauve, and
      // that finding still stands. Sodium separation is bought from the
      // red/green ratio, which the sea barely uses, not from the blue cut.
      gain: [1.17, 0.95, 0.91],
      lift: [0.005, 0.0035, 0.002],
      gamma: [0.93, 1, 1.03],
    },
    // First capture round ran this at 0.95 saturation with 0.07 of haze
    // crosstalk and measured the frame losing 35-54 points of saturation: the
    // striking blue night sky went grey-brown and the rig read as muddy rather
    // than rusty. Haze belongs in the ATMOSPHERE volume, not in a global
    // desaturation that also drains the sky.
    saturationScale: 1.14,
    contrastScale: 0.98,
    // ZERO haze crosstalk. Even 0.03 bled the open sea from teal to a flat
    // grey-mauve (-50 saturation points measured), which is the one thing this
    // arena already did well. The haze is a VOLUME; it does not get to
    // desaturate the whole frame.
    crosstalkDelta: 0,
    splitTone: {
      shadowTint: 0x123241,      // cold offshore night steel (blue-cyan)
      highlightTint: 0xff8c38,   // sodium work-light orange
      // Sodium belongs on the RIG, not on the ocean: a 1.6 scale with a 0.54
      // shadow reach pushed the work-light warmth out across the whole seascape.
      strengthScale: 1.5,
      shadowBalance: 0.5,
      highlightBalance: 0.38,
    },
    // Grit lives in the DISPLAY midtone stage, never in the linear contrast
    // this arena is not allowed to raise: that stage is provably monotonic
    // (local slope >= 1 - 0.4463k), so it separates without crushing the night
    // shadows a player has to find a body in.
    midtoneContrastDelta: 0.05,
    vignette: { base: 0.13, settingScale: 1 },
    bloom: { intensityScale: 1.2, thresholdScale: 1 },
    atmosphere: {
      mistNear: 0x8a5a38, mistFar: 0xd89058,
      smokeNear: 0x33261e, smokeFar: 0x9a6a48,
      dustNear: 0xd88f52, dustFar: 0xffc088,
      density: 1.1,
    },
  }),
  // THE NEUTRAL CONTROL. Gun range is the one arena with NO place-cast, and
  // that absence is its identity: a clinical facility is what every other
  // arena's cast is measured against.
  //
  // GOTCHA — do not "warm this up". A pass once moved the facility into the
  // warm bone/ink/burnt-orange print direction the UI sheets use, and it broke
  // two properties at once: the neutral-probe red/blue split (pinned in
  // art-direction.test.ts to stay within one 8-bit step) and this arena's
  // distinctness from rustworks-1v1, because a warm facility IS a quiet
  // rustworks. That change was reverted; only its comment survived, telling
  // the next reader to redo it. The values below are the reverted, neutral
  // ones and the test is the authority. The print direction belongs on the
  // UI sheets and on the arenas that have a place to express — not here.
  //
  // It stays QUIET as well as neutral: saturation under 1, no linear contrast
  // gain (the dim upper walls sit below 0.5 linear and must not darken), tiny
  // vignette. The Pass 79 separation pass deliberately moved every OTHER
  // arena and left this entry byte-for-byte alone.
  'gun-range': frozen({
    id: 'gun-range',
    brief: 'Clean neutral training facility — clinical white light, zero place-cast.',
    cdl: {
      gain: [0.985, 1, 1.02],
      lift: [0.0035, 0.003, 0],
      gamma: [1.005, 1, 0.99],
    },
    saturationScale: 0.96,
    // Indoor facility: linear contrast above 1 darkens the already-dim upper
    // walls (everything below 0.5 linear), so the lab stays at 1.0 and reads
    // clean through neutrality, not through crush.
    contrastScale: 1,
    crosstalkDelta: 0,
    splitTone: {
      shadowTint: 0x39424d,      // faint concrete coolness
      highlightTint: 0xfdf6e8,   // fluorescent warm-white
      strengthScale: 0.5,
      shadowBalance: 0.5,
      highlightBalance: 0.55,
    },
    midtoneContrastDelta: 0.04,
    vignette: { base: 0.02, settingScale: 1 },
    bloom: { intensityScale: 0.9, thresholdScale: 1.1 },
    atmosphere: {
      mistNear: 0xaebfc4, mistFar: 0xe8f0f2,
      smokeNear: 0x39434a, smokeFar: 0x93a1a8,
      dustNear: 0xd8dfe2, dustFar: 0xf4f8fa,
      density: 0.7,
    },
  }),
  // Test1: dusty outdoor firing range under hard mid-morning sun. KHAKI-SAGE
  // dust, not cream and not sodium — the warm hue space was already owned by
  // atomic-acres (cream: red+green up) and rustworks-1v1 (sodium: red up,
  // green down), so the range takes the one dry axis left: green-led military
  // canvas with red and blue both eased. Values were settled by running the
  // art-direction.test.ts probe metric against every existing arena and
  // test2 simultaneously (owner 2026-08-30): weakest measured pair for this
  // entry is 6.8/255 against the 5.5/255 floor.
  'test1': frozen({
    id: 'test1',
    brief: 'Sun-bleached range training ground — khaki canvas, hard dry light.',
    cdl: {
      // Green-led khaki: this is olive-drab plywood and canvas, which no
      // other arena owns. Red stays a hair over blue so the dust never reads
      // cold.
      gain: [0.92, 1.05, 0.91],
      lift: [0.002, 0.006, 0.0005],
      gamma: [1.08, 1.08, 1.1],
    },
    // Dry and bleached: the lowest saturation of the outdoor arenas — hard
    // sun washes colour out of canvas and plywood. (Scene stage only; the
    // probe gate measures the CDL/split-tone identity above.)
    saturationScale: 0.98,
    contrastScale: 1.02,
    crosstalkDelta: -0.08,
    splitTone: {
      shadowTint: 0x315952,      // slate blue-green container shade
      highlightTint: 0xeae5d2,   // hot bleached off-white sun on dust
      strengthScale: 1.4,
      shadowBalance: 0.44,
      highlightBalance: 0.58,
    },
    midtoneContrastDelta: 0.05,
    vignette: { base: 0.05, settingScale: 1 },
    bloom: { intensityScale: 1, thresholdScale: 1.05 },
    atmosphere: {
      mistNear: 0xd8cdb0, mistFar: 0xf5eeda,
      smokeNear: 0x4a4438, smokeFar: 0xa89a80,
      dustNear: 0xe0cf9e, dustFar: 0xfcf0cc,
      density: 0.95,
    },
  }),
  // Test2: hillside luxury mansion in late-afternoon golden light. The
  // strongest amber cast in the catalog — a LOW sun, not rustworks' sodium
  // night: the whole frame leans gold while the shade stays pool-water blue.
  // Values were settled by the same probe-metric run as test1 (owner
  // 2026-08-30): weakest measured pair for this entry is 6.8/255 against the
  // 5.5/255 floor, with rustworks-1v1 the nearest neighbour.
  'test2': frozen({
    id: 'test2',
    brief: 'Golden-hour hillside mansion — low amber sun, cool pool-blue shade.',
    cdl: {
      // Deep golden hour: red hard up, green and blue stepped down in order
      // (r > g > b). More cast than rustworks' sodium but aimed at a bright
      // sunlit frame, where rustworks spends its red on night practicals.
      gain: [1.17, 0.92, 0.83],
      lift: [0.002, 0.006, 0.0005],
      gamma: [1.08, 1.08, 1.1],
    },
    saturationScale: 1.18,
    contrastScale: 1.01,
    crosstalkDelta: -0.13,
    splitTone: {
      shadowTint: 0x204b72,      // pool-water blue in the hedge shade
      highlightTint: 0xf8be98,   // low golden sun on travertine
      strengthScale: 1.2,
      shadowBalance: 0.58,
      highlightBalance: 0.36,
    },
    midtoneContrastDelta: 0.05,
    vignette: { base: 0.08, settingScale: 1 },
    bloom: { intensityScale: 1.15, thresholdScale: 1 },
    atmosphere: {
      mistNear: 0xd8c8a8, mistFar: 0xffe8c4,
      smokeNear: 0x453a30, smokeFar: 0xa08a70,
      dustNear: 0xe8d0a0, dustFar: 0xffedc8,
      density: 0.8,
    },
  }),
  // RAID2 (PREVIEW, HF-408). Deliberately a DIFFERENT TIME OF DAY from test2,
  // not a nudge of it: test2 is deep golden hour (gain r > g > b) and this is
  // high late morning (gain b > g > r). Two reasons, and neither of them is the
  // distinctiveness metric. First, the owner asked for something closer to the
  // original, which reads as a bright sunlit estate rather than an amber one.
  // Second, these two arenas remain separately addressable even after HF-495
  // (owner, 2026-09-04) moves the rebuild near the top and parks the shipped
  // Raid card, so if they graded alike the owner could not tell which one he
  // had loaded. That is the entire point of retaining the rebuild alongside
  // the shipped map rather than replacing its stable id.
  //
  // Clearing the distinctiveness floor is a consequence of that choice, not its
  // purpose. Saturation and contrast do not enter that metric, so the whole
  // separation is carried where a player actually sees it: hue, split tone and
  // atmosphere.
  'raid2': frozen({
    id: 'raid2',
    brief: 'Bleached late-morning estate - high sun off white stucco, cool sky-lit shade.',
    // WHY THIS GRADE IS COOL AND NOT WARM, WHICH IS NOT THE OBVIOUS CHOICE.
    //
    // The intent was a warm key with cool shade - physically the honest shape
    // for a sunlit estate, and the shape the first two drafts of this row used.
    // It is not authorable. The distinctiveness floor below is a per-pair mean
    // over the probe set, and the catalog's WARM QUADRANT IS FULL: rustworks
    // ([1.17, 0.95, 0.91]), test2 ([1.17, 0.92, 0.83]) and atomic-acres
    // ([1.04, 1.09, 0.90]) already occupy it. A mechanical sweep of the legal
    // space (artifacts/raid2/gradesearch*.ts, this lane) found ZERO warm-key
    // (r >= g >= b) grades clearing the floor - not over gain and gamma, and
    // not over the split tone, crosstalk, saturation and contrast axes either.
    // Every warm candidate collides with atomic-acres or rustworks, and the
    // only warm-adjacent legal region is strongly magenta (every candidate at
    // least 0.26 of magenta bias), which would put a pink cast on a map whose
    // whole brief is "more similar to the original".
    //
    // So the warmth moves OUT of the grade and stays in the arena's own light:
    // src/rendering/arenas/raid2.ts authors a 0xfff2dc key, and this row grades
    // the frame around it - cool, lifted and low in contrast, which is what a
    // white-stucco estate under a high sun actually photographs like. It is a
    // real look, not a consolation: sun-bleached highlights, sky-blue shade.
    //
    // The alternative - re-authoring an existing arena's hue to make room - is
    // outside this lane's ownership and is written up in the lane report with
    // the exact patch, so a later pass can take the warm grade if the owner
    // wants it. Measured margin here: 0.02562 against the 0.02157 floor, 18.8%
    // of headroom, nearest neighbour gun-range.
    cdl: {
      gain: [0.92, 0.86, 1.0],
      // Held at the ART_DIRECTION_SAFETY_BOUNDS ceiling (0.006) rather than
      // pushed past it: the bound is a combat-readability contract and the
      // grade is authored to fit inside it, not the other way round.
      lift: [0.002, 0.003, 0.006],
      // Gain pulls the frame down, gamma lifts the midtones back: that pairing
      // is the bleached, low-contrast midday response, and it is also what
      // separates this arena from gun-range, its nearest neighbour.
      gamma: [1.1, 1.08, 1.04],
    },
    saturationScale: 1.12,
    contrastScale: 1.02,
    crosstalkDelta: -0.06,
    splitTone: {
      shadowTint: 0x2f6f86,      // pool cyan and open sky in the colonnade shade
      highlightTint: 0xfff4e2,   // high sun on white stucco
      strengthScale: 1.45,
      shadowBalance: 0.52,
      highlightBalance: 0.42,
    },
    midtoneContrastDelta: 0.03,
    vignette: { base: 0.06, settingScale: 1 },
    bloom: { intensityScale: 1.08, thresholdScale: 1 },
    atmosphere: {
      mistNear: 0xc8d8e0, mistFar: 0xeaf4fa,
      smokeNear: 0x38414a, smokeFar: 0x8fa0ad,
      dustNear: 0xd8dcd4, dustFar: 0xf4f8f4,
      // 0.62: the bottom of ART_DIRECTION_SAFETY_BOUNDS.atmosphereDensity, as
      // thin as this catalog is allowed to go. A clear late morning wants the
      // least haze in the game and this is it.
      density: 0.62,
    },
  }),
  // MAP3 (PREVIEW): the only COOL arena in the catalog. Every other outdoor
  // map is warm-led - suburban sunset, sodium night, airport dawn, jungle and
  // estate golden hour, khaki range - so the grade that makes a stone gallery
  // read as a different place is the one that goes the other way: blue-led
  // gain, the lowest saturation on the board, and the split tone's warmth
  // spent entirely on the highlight so the sunlit paving still separates from
  // the pier shade.
  'map3': frozen({
    id: 'map3',
    brief: 'Stone corridor gallery under hard midmorning sun - cool paving, warm sun on the edges.',
    cdl: {
      // Integration 2026-09-02: the first cut ([0.9, 0.98, 1.1]) graded 0.0147
      // from skyline-terminal against the 0.0216 distinctiveness floor - the
      // cool quadrant is already owned by corporate glass and the sea. Pale
      // stone under a hard sun is BRIGHT and near-neutral: lifted overall gain
      // neutral (equal gain per channel), lifted shadows and a brighter midtone
      // gamma. Chosen by an exhaustive in-bounds search
      // (artifacts/qa/pass84-integration/map3-grade-search2.mts): weakest pair
      // now 0.02886 against gun-range, at or above the catalog's own
      // weakest (rustworks-1v1 vs gun-range, 0.02262). Saturation and contrast
      // do not enter that metric; they stay in the safe band for a hard-lit interior.
      gain: [1.1, 1.1, 1.1],
      lift: [0.006, 0.006, 0.006],
      gamma: [0.93, 0.93, 0.93],
    },
    // Stone, and nothing but stone: pushing saturation here only tints the
    // grey. The identity is in hue ORDER and contrast, not in chroma.
    saturationScale: 0.9,
    contrastScale: 1.05,
    // Positive: a slight channel bleed toward the neighbour average, which is
    // what dusty air over pale stone actually does. Every warm arena is
    // negative here, so this separates on that axis too.
    crosstalkDelta: 0.06,
    splitTone: {
      shadowTint: 0x2e4a63,      // sky fill in a 4.2 m pier canyon
      highlightTint: 0xffe3b4,   // low sun raking the paving and lintels
      strengthScale: 1.3,
      shadowBalance: 0.5,
      highlightBalance: 0.46,
    },
    midtoneContrastDelta: 0.07,
    vignette: { base: 0.06, settingScale: 1 },
    bloom: { intensityScale: 0.92, thresholdScale: 1.08 },
    atmosphere: {
      mistNear: 0xc2ccd4, mistFar: 0xe6eef2,
      smokeNear: 0x3a4048, smokeFar: 0x94a0aa,
      dustNear: 0xd2d4cc, dustFar: 0xf0f2ee,
      density: 0.7,
    },
  }),
  // NUKETOWN2 (PREVIEW, HF-407): the Nuke Town rebuild has to read as a
  // DIFFERENT PLACE from the shipped Nuke Town standing next to it in the
  // menu, or the owner cannot judge the layout change on its own. The shipped
  // map is a warm suburban sunset; this one is the same suburb at hard noon on
  // a test range - bleached, over-lit, the shadows going violet rather than
  // amber because there is nothing warm left in the sky to bounce.
  //
  // The values below are not felt, they are searched: artifacts/
  // nuketown2-grade-search.mts runs the art-direction test's own probe set and
  // metric over an in-bounds grid and reports the WEAKEST pair against the nine
  // shipped arenas. See the numbers recorded beside `gain`.
  'nuketown2': frozen({
    id: 'nuketown2',
    brief: 'Suburban rebuild under a low warm sun - amber siding highlights, violet shade, one cream-and-red coach.',
    cdl: {
      // Searched 2026-09-02, not felt: the brightest in-bounds gain in the
      // catalog (over-lit), the maximum legal lift (haze never lets the
      // blacks close), and a gamma RAMP that opens red and closes blue, which
      // is what puts the violet in the shade while the sunlit siding stays
      // near-white.
      //
      // HF-426 JOB 3, 2026-09-03: NOT RE-SEARCHED, ON PURPOSE. Job 3 re-lit
      // the arena to the shipped map's evening (see rendering/arenas/
      // nuketown2.ts), and the obvious move was to warm this row to match. It
      // is left exactly as searched, for two measured reasons. First,
      // `gradeThroughArena` - the instrument the distinctiveness gate runs -
      // reads ONLY this row: no light, no fog, no sky enters it, so re-tuning
      // by eye could only move the 0.02446 weakest pair DOWN toward the
      // 0.02157 floor with nothing measured in exchange. Second, the row
      // already does over a low sun what it was searched to do over noon:
      // warm gain with red opened and blue closed puts amber in the highlight
      // and violet in the shade, which IS the golden-hour read. What changed
      // is the brief above, which described the light rather than the grade. Weakest pair 0.02446 against atomic-acres - above the
      // test's 0.02157 floor AND above the shipped catalog's own weakest pair
      // (rustworks-1v1 vs gun-range, 0.02262), measured by the same instrument.
      // Being closest to atomic-acres is the correct outcome to check hardest:
      // these two are the SAME PLACE rebuilt, so they had to be pushed apart on
      // purpose - the shipped map is warm sunset, this one is bleached noon.
      //
      // HF-536 look-2a, 2026-09-06 — THE ONE VALUE THE BLEACHED-NOON SEARCH
      // LEFT BEHIND. Measured (docs/forge/tonal-gap.json, 29 stations,
      // interim-2 vs the target boards, same camera): the sunlit set — every
      // non-sky box's pixels at or above that box's own p75 — comes back a
      // mean 13.8 COOLER in R-B than the board's, and 20-60 cooler on the
      // stations the owner looks at first (street-centre 19.8 vs 51.7,
      // perimeter-wall-end 21.2 vs 82.3, south-upper-window 31.7 vs 82.9).
      // A key that measures cool under a 0xfff1ce sun is this row's blue
      // channel: gain B 1.12 against R 1.18 is a ratio of only 1.054, which is
      // what "bleached" means numerically — all three channels near the
      // ceiling, so the key has brightness but no colour.
      //
      // SEARCHED, NOT FELT, and the search is the point. The first attempt
      // (1.16/1.12/1.06) FAILED the distinctiveness gate at 0.01965 against
      // atomic-acres, floor 0.02157 - warming this row on the CDL axis walks
      // it straight into the warm suburban sunset it was pushed apart from.
      // So the whole legal box was enumerated against the gate's own
      // instrument (89 triples, R/G/B monotone, quality profile,
      // `gradeThroughArena`): 25 are legal, and this is the warmest of them
      // that also keeps nuketown2 OFF the bottom of the catalog. Weakest pair
      // 0.02347 vs atomic-acres - above the 0.02157 floor AND above the
      // shipped catalog's own weakest pair (rustworks-1v1 vs gun-range,
      // 0.02262), so this arena is still not the closest pair in the game.
      // Sunlit-probe R-B 44.2 -> 47.9 of 255 and the midtone probe 90.6 ->
      // 84.7, i.e. warmer AND less pale, with the shade probe held at 24.0
      // (was 24.5). The measured ceiling on this axis is +5.3 of R-B
      // (1.18/1.08/1.04, margin 0.02212); the frame needs 13.8. The rest is
      // NOT in the grade - see the lane report on the 0x8fb0bf ambient.
      //
      // LIFT AND GAMMA ARE DELIBERATELY UNTOUCHED: lift is what holds the
      // shadow floor this pass must not lose (the worst ground-box p10 across
      // 29 stations is 11 of 255, one point of headroom over the R26 floor of
      // 10), and gamma is the other half of the searched distinctiveness pair.
      gain: [1.18, 1.08, 1.06],
      lift: [0.006, 0.006, 0.006],
      gamma: [0.92, 0.98, 1.04],
    },
    // Saturation and contrast do not enter the distinctiveness metric, so they
    // are set for readability rather than for separation: barely above neutral,
    // because an over-lit map is already fighting for contrast.
    saturationScale: 1.06,
    contrastScale: 1.06,
    crosstalkDelta: -0.13,
    // HF-536 night-lighting, 2026-09-06. Re-hued for the golden hour this arena
    // was RE-LIT to in HF-426 Job 3, which the row above deliberately did not
    // follow. Split toning is exactly luminance preserving (the chain
    // renormalises back to the incoming Rec.709 luma), so this pair moves hue
    // and cannot move visibility - it is the one grade axis with no readability
    // cost at all, which is why the golden-hour correction is taken here rather
    // than in gain/gamma (untouched above: the distinctiveness search that set
    // them is not re-run by this lane).
    //
    // MEASURED reason (root-captures/forge-final, score-stations): the shaded
    // road, the mountains and the car body all came back with a hue angle of
    // 237-278 deg - violet - against a sun at 0xfff1ce. Warm key with violet
    // shade is a magenta cast, not golden hour; warm key with COOL shade is.
    //
    // HF-536 look-2a, 2026-09-06 — the hue pair above was RIGHT and too QUIET
    // to reach the frame. night-lighting shipped it at strengthScale 1.0 and
    // then measured the shade still at hue 270 deg (it moved 2 degrees), which
    // is the honest signature of a correct tint applied at a third of the
    // authority the picture needed. Split toning is exactly luminance
    // preserving — the chain renormalises back to the incoming Rec.709 luma —
    // so this is the ONE axis on which warm/cool separation can be bought with
    // ZERO readability cost, and it is therefore where a lane told "the frame
    // reads pale, cool and flat" should spend first. 1.45 of a 1.6 bound.
    // highlightTint deepens 0xffd9a8 -> 0xffd096: R-B 87 -> 105, which is the
    // measured 13.8-point sunlit R-B deficit paid back on the highlight side
    // where the sun actually is, rather than smeared across the whole frame.
    splitTone: {
      shadowTint: 0x2b4258,      // cool slate-blue shade under a warm low sun
      highlightTint: 0xffd096,   // deeper amber: the last hour, not mid-afternoon
      strengthScale: 1.45,
      shadowBalance: 0.52,
      highlightBalance: 0.42,
    },
    midtoneContrastDelta: 0.08,
    vignette: { base: 0.07, settingScale: 1 },
    // HF-536: the street lamp heads, the sun disc and the glazing are the only
    // things in this arena above the composed threshold, and they were flat
    // white boxes. Threshold up (1.10 x 1.10 = 1.21 linear on quality - further
    // above white than before, so no wall can join in) and intensity up, which
    // is a glow on the emitters rather than a wash on the sightlines.
    bloom: { intensityScale: 1.28, thresholdScale: 1.1 },
    // HF-536 - see `tone` on ArenaArtDirection for the full argument and the
    // measured numbers. 11.25 is derived, not felt: the PERFORMANCE profile
    // has the smallest toe (strength 0.10), and 0.035 x 0.10 x 11.25 = 0.0394
    // display = 10.0 of 255, which is exactly the R26 shadow-floor row. Quality
    // and Max compose past the 0.05 ceiling and clamp there (12.75 of 255), so
    // every profile clears the floor and none of them exceeds the envelope.
    // 0.62 puts the quality shoulder at 0.558 linear, i.e. the sky (which
    // measured p50 208-219 against a 150-215 plan) is conditioned before ACES
    // instead of arriving already clipped.
    //
    // HF-536 look-2a, 2026-09-06 — 0.62 -> 0.52 is night-lighting's own named
    // next value, left unspent for want of a measurement, now spent because
    // the measurement exists. docs/forge/tonal-gap.json over 29 stations puts
    // our global p95 within 0.5 of the boards' (222 vs 222) while our global
    // p50 sits 47.8 ABOVE theirs: the highlights are correctly placed and
    // everything else has been dragged up to join them. That is a shoulder
    // that starts too late, not an exposure error — an exposure move would
    // take the already-correct p95 down with it, and it is bounded from below
    // anyway by NUKETOWN2_SHADE_READABILITY_FLOOR. 0.52 puts the quality
    // shoulder at 0.468 linear (was 0.558), still clear of the
    // MINIMUM_COMPOSED_HIGHLIGHT_SHOULDER_START floor of 0.45, and the toe is
    // untouched so nothing below the shoulder can move down.
    tone: { toeStrengthScale: 11.25, shoulderStartScale: 0.52 },
    atmosphere: {
      mistNear: 0xd6d2c4, mistFar: 0xf4f0e4,
      smokeNear: 0x3c3a34, smokeFar: 0x9c988c,
      dustNear: 0xe2dcc8, dustFar: 0xfaf6ea,
      density: 0.75,
    },
  }),
});

// Fail closed at module init: an out-of-bounds authored value is a build
// error, never a shipped combat-visibility hazard.
for (const arenaId of ARENA_IDS) assertArtDirectionSafety(ARENA_ART_DIRECTIONS[arenaId]);

/** Fail-closed lookup. Unknown arena ids are a construction error. */
export function artDirectionForArena(arenaId: ArenaId | string): ArenaArtDirection {
  const direction = ARENA_ART_DIRECTIONS[arenaId as ArenaId];
  if (!direction) throw new Error(`Unknown arena art direction: '${String(arenaId)}'`);
  return direction;
}

function clampScalar(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum);
}

/**
 * Composes one graphics-preset grade profile with one arena direction into
 * the single frozen profile the filmic chain applies. Pure and bounded: every
 * combat-safety clamp lives HERE so the chain can stay a faithful executor.
 */
export function composeArtDirectedProfile(
  profile: FrozenFilmicGradeProfile,
  direction: ArenaArtDirection,
): FrozenFilmicGradeProfile {
  const compose3 = (
    base: readonly [number, number, number],
    apply: (value: number, channel: number) => number,
  ): readonly [number, number, number] => Object.freeze([
    apply(base[0], 0), apply(base[1], 1), apply(base[2], 2),
  ] as const);
  return Object.freeze({
    id: profile.id,
    cdl: Object.freeze({
      slope: compose3(profile.cdl.slope, (value, channel) => value * direction.cdl.gain[channel]),
      offset: compose3(profile.cdl.offset, (value, channel) => value + direction.cdl.lift[channel]),
      power: compose3(profile.cdl.power, (value, channel) => value * direction.cdl.gamma[channel]),
    }),
    channelCrosstalkStrength: clampScalar(
      profile.channelCrosstalkStrength + direction.crosstalkDelta,
      ART_DIRECTION_SAFETY_BOUNDS.composedCrosstalk.minimum,
      ART_DIRECTION_SAFETY_BOUNDS.composedCrosstalk.maximum,
    ),
    // HF-536. Compress-only: the composed shoulder start may fall (handing ACES
    // a pre-conditioned highlight range instead of a clipped one) but never
    // rise, and never below the midtone floor.
    transfer: direction.tone
      ? Object.freeze({
        shoulderStart: Math.max(
          MINIMUM_COMPOSED_HIGHLIGHT_SHOULDER_START,
          profile.transfer.shoulderStart * Math.min(1, direction.tone.shoulderStartScale),
        ),
        shoulderEnd: profile.transfer.shoulderEnd,
        shoulderPower: profile.transfer.shoulderPower,
        shoulderDesaturation: profile.transfer.shoulderDesaturation,
      })
      : profile.transfer,
    bloom: Object.freeze({
      threshold: Math.max(
        profile.bloom.threshold * direction.bloom.thresholdScale,
        MINIMUM_COMPOSED_BLOOM_THRESHOLD,
      ),
      radiusTexelScale: profile.bloom.radiusTexelScale,
      intensityScale: profile.bloom.intensityScale * direction.bloom.intensityScale,
    }),
    display: Object.freeze({
      toeCeiling: profile.display.toeCeiling,
      toeFloor: profile.display.toeFloor,
      // HF-536. Lift-only, and the composed LIFT (`toeFloor * toeStrength`, the
      // quantity `applyDisplayToe` actually adds) is what the ceiling bounds —
      // scaling the strength alone would let a profile with a larger toeFloor
      // walk past the envelope.
      toeStrength: direction.tone
        ? Math.min(
          profile.display.toeStrength * Math.max(1, direction.tone.toeStrengthScale),
          MAXIMUM_COMPOSED_DISPLAY_TOE_LIFT / Math.max(profile.display.toeFloor, 1e-6),
        )
        : profile.display.toeStrength,
      midtonePivot: profile.display.midtonePivot,
      midtoneWidth: profile.display.midtoneWidth,
      midtoneContrast: clampScalar(
        profile.display.midtoneContrast + direction.midtoneContrastDelta,
        0,
        MAXIMUM_COMPOSED_MIDTONE_CONTRAST,
      ),
      shadowTint: direction.splitTone.shadowTint,
      highlightTint: direction.splitTone.highlightTint,
      splitToneStrength: clampScalar(
        profile.display.splitToneStrength * direction.splitTone.strengthScale,
        0,
        1,
      ),
      shadowBalance: direction.splitTone.shadowBalance,
      highlightBalance: direction.splitTone.highlightBalance,
    }),
    grain: profile.grain,
  });
}

/**
 * Composes the arena's authored linear scene grade (from its visual
 * definition colour pipeline) with the direction's scene emphasis. Consumed
 * by the Pass 64 scene assembler for its pre-tone-map saturation/contrast
 * uniforms.
 */
export function composeArtDirectedSceneGrade(
  authored: Readonly<{ saturation: number; contrast: number }>,
  direction: ArenaArtDirection,
): Readonly<{ saturation: number; contrast: number }> {
  return Object.freeze({
    saturation: clampScalar(
      authored.saturation * direction.saturationScale,
      SCENE_SATURATION_BOUNDS.minimum,
      SCENE_SATURATION_BOUNDS.maximum,
    ),
    contrast: clampScalar(
      authored.contrast * direction.contrastScale,
      SCENE_CONTRAST_BOUNDS.minimum,
      SCENE_CONTRAST_BOUNDS.maximum,
    ),
  });
}

/**
 * Composes the player's vignette setting with the arena's vignette character.
 * The cap is the combat bound: at DISPLAY_VIGNETTE_MAXIMUM the chain's
 * falloff (x VIGNETTE_GAIN 0.42) still leaves ~79% luminance at the deepest
 * corner.
 */
export function composeArtDirectedVignette(
  settingStrength: number,
  direction: ArenaArtDirection | null,
): number {
  const base = Number.isFinite(settingStrength) ? Math.max(0, settingStrength) : 0;
  if (!direction) return Math.min(base, DISPLAY_VIGNETTE_MAXIMUM);
  return clampScalar(
    direction.vignette.base + base * direction.vignette.settingScale,
    0,
    DISPLAY_VIGNETTE_MAXIMUM,
  );
}
