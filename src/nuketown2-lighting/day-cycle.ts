/**
 * nuketown2-lighting/day-cycle.ts — Nuke Town's moving sun, as pure numbers.
 *
 * THE COMPLAINT. Nuke Town ships three hand-authored skies
 * (`late-morning`, `golden-hour`, `overcast` in `presets.ts`) and the sun never
 * moves: you pick one from a menu and it freezes. This module is the bounded
 * answer — a pure function of one parameter,
 * `nuketown2DayCycle(t)` with `t` in `[0, 1)` and `0` at dawn, returning a
 * preset-shaped value by interpolating the AUTHORED presets. It composes what
 * exists; it authors no fourth look.
 *
 * THE ARC. `late-morning` -> `golden-hour` -> dusk -> night -> dawn.
 * `overcast` is NOT a point on the arc: it is a weather state, orthogonal to
 * time, and nothing here touches it (the test pins that no `t` ever returns
 * its id and that its table row is unchanged).
 *
 * PHASE LOCK. One timetable drives everything. Each segment of `t` carries a
 * single interpolation amount `u`, and every time-varying field — elevation,
 * azimuth, illuminances, tints, fog span, practical base gain, filmic scales,
 * capture hour — is evaluated at that same `u`. The curves cannot drift out
 * of phase because there is only one curve parameter. Sun elevation is the
 * master in the stronger sense too: the practical ramp below is a function of
 * the computed elevation, not of `t` directly.
 *
 * ANGLES AS ANGLES. Elevation lerps in degrees; azimuth lerps on the circle
 * (shortest-path), so the overnight return from +28° to −44° slews 72° back
 * through 0° while the beam is off, instead of jumping 288° forward through
 * ±180° or wrapping discontinuously.
 *
 * COLOURS IN LINEAR RGB. The tints are linear-light multipliers over authored
 * linear colours, so per-channel linear lerp IS linear-RGB mixing. No sRGB
 * transfer is applied anywhere — mixing gamma-encoded channels is what gives
 * the muddy transitions this lane exists to remove. The test pins the
 * mid-segment value at the arithmetic mean.
 *
 * PRACTICALS RAMP, NEVER SWITCH. Below `PRACTICAL_OFF_ABOVE_DEGREES` (11°,
 * exactly the anchor's elevation, so both authored knots reproduce byte-exact)
 * an elevation-driven smoothstep ramps up to `PRACTICAL_NIGHT_BOOST` at
 * `PRACTICAL_FULL_BELOW_DEGREES` (6.5°). Dusk and night ride at full boost;
 * dawn rides it half-on. Sizing uses `NUKETOWN2_PRACTICAL_MINIMUM_EMISSIVE`
 * (never a hardcoded 1.4), and the composed floor stays above the bloom
 * threshold at every `t` — fixtures stay light sources, never grey plates.
 *
 * DUSK / NIGHT / DAWN VALUES are continuations of the authored
 * late-morning → golden-hour vector (lower, warmer key; cooler dome; shorter
 * fog; practicals up), held inside `LIGHTING_CONDITION_BOUNDS`, not new hues.
 * At night the beam is off (`directIlluminanceLux: 0`, like the authored
 * stratus row) with elevation held at the 6° envelope floor, so the key term
 * sits exactly at its published minimum rather than escaping it.
 *
 * THE INVARIANT. The authored path never consults this module: `?tod=authored`
 * resolves through `resolveNuketown2LightingConditions` exactly as today, and
 * the two authored knots of this function deep-equal the authored table rows,
 * so the deterministic frame cannot move. Wiring into the shipped arena lives
 * in `src/legacy-main.ts` (sibling lane); see the lane report's
 * `CROSS-LANE REQUESTS`.
 *
 * FROZEN LIGHT SET. Like the rest of this directory: numbers only. No light,
 * material, node, texture, THREE import, or pipeline — this lane adds no
 * material variant and owes no precompile entry.
 *
 * Skills applied: `webgpu-tsl-arena-forging` (Workflow: arena lighting as
 * authored data, legacy release untouched; Required architecture: lighting as
 * numbers, no authority change); `threejs-webgpu-interior-lighting-look`
 * (emissive fixtures above the bloom threshold; bloom/vignette fences held;
 * readability rules: shade floor, fog-bound sightlines, no per-profile
 * divergence); `photoreal-procedural-scene-forge` (§4 derive-don't-tune and
 * port-structure-not-numbers; §6 readability bound wins over fidelity, gates
 * asserted never moved).
 */

import type { Rgb3 } from '../rendering/lighting-conditions';
import type { BakedIndirectTier } from '../rendering/lighting/baked-indirect';
import {
  NUKETOWN2_PRACTICAL_MINIMUM_EMISSIVE,
  nuketown2SkyPreset,
  type Nuketown2SkyPreset,
  type Nuketown2SkyPresetId,
} from './presets';

/**
 * Practicals are fully off at and above the anchor's own elevation, so the
 * golden-hour knot reproduces the authored gain exactly; fully on at and
 * below the dusk floor. Between them a smoothstep ramp — a switch would pop.
 */
export const NUKETOWN2_DAY_CYCLE_PRACTICAL_OFF_ABOVE_DEGREES = 11;
export const NUKETOWN2_DAY_CYCLE_PRACTICAL_FULL_BELOW_DEGREES = 6.5;
/** Night lift on the practical base gain, sized against the imported floor. */
export const NUKETOWN2_DAY_CYCLE_PRACTICAL_NIGHT_BOOST = 0.45;

/** Dimmest emissive channel of the arena's practical fixtures (1.4). */
const DIMMEST_PRACTICAL_CHANNEL = Math.min(
  NUKETOWN2_PRACTICAL_MINIMUM_EMISSIVE.warm,
  NUKETOWN2_PRACTICAL_MINIMUM_EMISSIVE.cold,
);

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function lerp(from: number, to: number, amount: number): number {
  return from + (to - from) * amount;
}

/** Shortest-path circular lerp for azimuth deltas, in degrees. */
function lerpAngleDegrees(from: number, to: number, amount: number): number {
  const delta = ((to - from + 540) % 360) - 180;
  return from + delta * amount;
}

/** Linear-light per-channel mix: the tints live in linear RGB already. */
function lerpTint(from: Rgb3, to: Rgb3, amount: number): Rgb3 {
  return [lerp(from[0], to[0], amount), lerp(from[1], to[1], amount), lerp(from[2], to[2], amount)];
}

function smoothstep(amount: number): number {
  const x = clamp01(amount);
  return x * x * (3 - 2 * x);
}

/** Elevation-driven practical lift. Exactly 0 at and above the anchor. */
function practicalBoost(elevationDegrees: number): number {
  const span = NUKETOWN2_DAY_CYCLE_PRACTICAL_OFF_ABOVE_DEGREES
    - NUKETOWN2_DAY_CYCLE_PRACTICAL_FULL_BELOW_DEGREES;
  return NUKETOWN2_DAY_CYCLE_PRACTICAL_NIGHT_BOOST
    * smoothstep((NUKETOWN2_DAY_CYCLE_PRACTICAL_OFF_ABOVE_DEGREES - elevationDegrees) / span);
}

type DayCycleStop = {
  t: number;
  elevation: number;
  azimuth: number;
  direct: number;
  sky: number;
  extinction: number;
  sunTint: Rgb3;
  skyTint: Rgb3;
  fogTint: Rgb3;
  fogNear: number;
  fogFar: number;
  practicalBase: number;
  tier: BakedIndirectTier;
  bloom: number;
  vignette: number;
  godray: number;
  midtone: number;
  /** Unwrapped hour (night is 24.0); wrapped to [0, 24) on output. */
  hour: number;
  id: Nuketown2SkyPresetId;
  brief: string;
};
const MORNING = nuketown2SkyPreset('late-morning');
const GOLDEN = nuketown2SkyPreset('golden-hour');


const fromPreset = (
  t: number,
  entry: Nuketown2SkyPreset,
  hour: number,
): DayCycleStop => ({
  t,
  elevation: entry.sunElevationDegrees,
  azimuth: entry.sunAzimuthDeltaDegrees,
  direct: entry.directIlluminanceLux,
  sky: entry.skyIlluminanceLux,
  extinction: entry.cloudExtinction,
  sunTint: entry.sunTint,
  skyTint: entry.skyTint,
  fogTint: entry.fogTint,
  fogNear: entry.fogNear,
  fogFar: entry.fogFar,
  practicalBase: entry.practicalEmissiveGain,
  tier: entry.bakedIndirect.preferredTier,
  bloom: entry.filmic.bloomThresholdScale,
  vignette: entry.filmic.vignetteScale,
  godray: entry.filmic.godrayAdditiveGain,
  midtone: entry.filmic.midtoneContrastDelta,
  hour,
  id: entry.id,
  brief: entry.brief,
});

/**
 * The timetable. The two clear authored presets are stops taken straight from
 * the table (structural exactness, not retyped numbers); dawn, dusk and night
 * continue their vector inside the published envelope. Overcast appears here
 * nowhere.
 */
const STOPS: readonly DayCycleStop[] = Object.freeze([
  {
    t: 0,
    elevation: 9,
    azimuth: -44,
    direct: 2_200,
    sky: 3_400,
    extinction: 0,
    sunTint: [1.06, 0.97, 0.85],
    skyTint: [0.93, 0.96, 1.09],
    fogTint: [1.0, 1.01, 1.04],
    fogNear: 60,
    fogFar: 152,
    practicalBase: 1.1,
    tier: 'low',
    bloom: 1.02,
    vignette: 1.0,
    godray: 0.08,
    midtone: 0,
    hour: 6.2,
    id: 'golden-hour',
    brief: 'Day-cycle dawn: low cool sun, practicals half on.',
  },
  fromPreset(0.25, MORNING, MORNING.captureHour),
  fromPreset(0.55, GOLDEN, GOLDEN.captureHour),
  {
    t: 0.68,
    elevation: 6.5,
    azimuth: 12,
    direct: 2_600,
    sky: 3_600,
    extinction: 0,
    sunTint: [1.1, 0.94, 0.78],
    skyTint: [0.9, 0.94, 1.1],
    fogTint: [0.99, 1.0, 1.03],
    fogNear: 56,
    fogFar: 144,
    practicalBase: 1.0,
    tier: 'low',
    bloom: 1.0,
    vignette: 1.0,
    godray: 0.12,
    midtone: 0,
    hour: 18.4,
    id: 'golden-hour',
    brief: 'Day-cycle dusk: sun on the envelope floor, practicals full.',
  },
  {
    t: 0.82,
    elevation: 6.0,
    azimuth: 28,
    direct: 0,
    sky: 900,
    extinction: 0,
    sunTint: [1, 1, 1],
    skyTint: [0.92, 0.96, 1.1],
    fogTint: [1.0, 1.01, 1.05],
    fogNear: 54,
    fogFar: 140,
    practicalBase: 1.0,
    tier: 'low',
    bloom: 1.0,
    vignette: 1.0,
    godray: 0.04,
    midtone: 0,
    hour: 24.0,
    id: 'golden-hour',
    brief: 'Day-cycle night: beam off, dome only, practicals full.',
  },
]);

const DAWN = STOPS[0];

/**
 * Nuke Town's time of day as authored data. `t` in `[0, 1)`, `0` at dawn;
 * out-of-range wraps, non-finite throws. Pure and frozen, like the table.
 */
export function nuketown2DayCycle(t: number): Nuketown2SkyPreset {
  if (!Number.isFinite(t)) {
    throw new Error(`nuketown2DayCycle: t must be a finite number, got ${String(t)}`);
  }
  const raw = ((t % 1) + 1) % 1;
  // Canonicalise below any physical resolution (1e-12 of a day is 86 ns) so
  // wrap-around callers (-0.1 vs 0.9) and knot callers (0.82 vs 0.82) take the
  // same segment with the same amount instead of differing by one ulp.
  const tn = Math.round(raw * 1e12) / 1e12;
  // The final segment (night -> dawn) is reachable only through the
  // fallthrough: every earlier segment ends at a stop with t < 1.
  let from: DayCycleStop = STOPS[STOPS.length - 1];
  let to: DayCycleStop = { ...DAWN, t: 1, hour: DAWN.hour + 24 };
  for (let i = 0; i < STOPS.length - 1; i += 1) {
    if (tn < STOPS[i + 1].t) {
      from = STOPS[i];
      to = STOPS[i + 1];
      break;
    }
  }
  const span = to.t - from.t;
  const u = span > 0 ? (tn - from.t) / span : 0;
  const elevation = lerp(from.elevation, to.elevation, u);
  const practicalEmissiveGain = lerp(from.practicalBase, to.practicalBase, u) + practicalBoost(elevation);
  const id = u < 0.5 ? from.id : to.id;
  const brief = u < 0.5 ? from.brief : to.brief;
  const tier = u < 0.5 ? from.tier : to.tier;
  return Object.freeze({
    id,
    brief,
    captureHour: lerp(from.hour, to.hour, u) % 24,
    sunElevationDegrees: elevation,
    sunAzimuthDeltaDegrees: lerpAngleDegrees(from.azimuth, to.azimuth, u),
    directIlluminanceLux: lerp(from.direct, to.direct, u),
    skyIlluminanceLux: lerp(from.sky, to.sky, u),
    cloudExtinction: lerp(from.extinction, to.extinction, u),
    sunTint: Object.freeze(lerpTint(from.sunTint, to.sunTint, u)) as Rgb3,
    skyTint: Object.freeze(lerpTint(from.skyTint, to.skyTint, u)) as Rgb3,
    fogTint: Object.freeze(lerpTint(from.fogTint, to.fogTint, u)) as Rgb3,
    fogNear: lerp(from.fogNear, to.fogNear, u),
    fogFar: lerp(from.fogFar, to.fogFar, u),
    practicalEmissiveGain,
    bakedIndirect: Object.freeze({ preferredTier: tier, compositeScale: 1.0 }),
    filmic: Object.freeze({
      bloomThresholdScale: lerp(from.bloom, to.bloom, u),
      vignetteScale: lerp(from.vignette, to.vignette, u),
      godrayAdditiveGain: lerp(from.godray, to.godray, u),
      midtoneContrastDelta: lerp(from.midtone, to.midtone, u),
    }),
  });
}

/**
 * Composed practical floor under the cycle, in the same units
 * `nuketown2PracticalEmissiveFloor` reports: dimmest fixture channel times
 * the cycle gain. Above the bloom threshold at every `t` (tested).
 */
export function nuketown2DayCyclePracticalFloor(t: number): number {
  return DIMMEST_PRACTICAL_CHANNEL * nuketown2DayCycle(t).practicalEmissiveGain;
}
