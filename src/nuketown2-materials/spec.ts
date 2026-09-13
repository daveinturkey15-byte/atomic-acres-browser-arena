/**
 * nuketown2-materials/spec.ts — the wear contract, as data.
 *
 * WHY A SPEC TABLE AND NOT JUST SHADER CODE.
 *
 * The owner's report on the rebuilt map was that it "looks like basic
 * geometry". The arena was not short of *procedural* materials — it already had
 * lap siding, shingles and asphalt written as TSL node graphs. What it was
 * short of is the property that makes a surface read as a real one:
 *
 *   1. WEAR AT THREE SCALES. A photograph of a real wall shows sub-millimetre
 *      grain, hand-sized scuffs, and metre-scale traffic and weather
 *      gradients, all at once. The shipped materials carried exactly one
 *      scale — a mid-frequency fBm — which is the single loudest CG tell there
 *      is (photoreal-procedural-scene-forge, method step 2).
 *   2. WEAR THE ALBEDO CAN CARRY. The shipped materials moved albedo by 3-6%.
 *      Under this arena's sky that is invisible: the eye cannot resolve a 4%
 *      step on a large flat surface. The rule the skill states, and the one
 *      this file pins mechanically, is that anything the frame must SHOW is a
 *      10-30% albedo step or it is geometry. Roughness is the second layer,
 *      never the carrier.
 *
 * Both properties are numbers, so they live here, in a table a unit test can
 * read, and the node graphs in `families/` are built FROM this table rather
 * than beside it. That is the whole point: the gate and the shader cannot
 * drift apart, because the shader has no numbers of its own.
 *
 * Every length in this file is METRES, and the invariants below are the
 * skill's three authored bands:
 *   grain    0.5 - 1.5 mm
 *   scuff    20  - 80  mm
 *   traffic  0.5 - 3   m
 *
 * Method observed in `StarKnightt/morning-diner` (Claude Fable, 2026), shared
 * by the owner via x.com/prasenx/status/2095537643182563778; re-implemented
 * from first principles.
 */

/** The eight material families this arena is built out of. */
export type Nuketown2MaterialFamily =
  | 'siding'
  | 'roof'
  | 'asphalt'
  | 'concrete'
  | 'timber'
  | 'glass'
  | 'painted-metal'
  | 'lawn';

/**
 * One wear scale.
 *
 * `sizeM` is the size of ONE feature in metres — not a frequency, not a "noise
 * scale". Authoring in millimetres and measuring the result is the rule; a
 * generator that intends a 1 mm grain and ships a 20 mm band passes every code
 * review and fails every frame.
 *
 * `albedo` and `roughness` are peak signed swings applied at that scale.
 */
export interface WearScale {
  /** Size of one feature, in metres. */
  readonly sizeM: number;
  /** Peak signed albedo swing at this scale, as a fraction of the base. */
  readonly albedo: number;
  /** Peak signed roughness swing at this scale, absolute. */
  readonly roughness: number;
}

/** One material's authored physical description. */
export interface Nuketown2MaterialSpec {
  /** Stable material name. These are read by the coplanar instrument, so they never change casually. */
  readonly name: string;
  readonly family: Nuketown2MaterialFamily;
  /** Base albedo as an sRGB hex, exactly as an artist would name it. */
  readonly baseSrgb: number;
  /** Base roughness before any wear term. */
  readonly roughness: number;
  readonly metalness: number;
  /** 0.5 - 1.5 mm: paint tooth, aggregate grit, timber fibre, turf blade tips. */
  readonly grain: WearScale;
  /** 20 - 80 mm: scuffs, chips, heel marks, hail pocks, hand smears. */
  readonly scuff: WearScale;
  /** 0.5 - 3 m: traffic lanes, rain wash, sun fade, mould, the mower's turn. */
  readonly traffic: WearScale;
  /**
   * Peak DARKENING from the metre-scale soiling mask, as a fraction of the
   * base albedo. This is the term that carries "this surface has been rained
   * on and walked over" and it is deliberately separate from `traffic.albedo`
   * (which is symmetric) because soiling only ever subtracts.
   */
  readonly soil: number;
  /**
   * The distance, in metres, at which this surface is actually READ.
   *
   * WHY A MATERIAL HAS TO DECLARE THIS. Wear at a scale the frame cannot
   * resolve is not fidelity, it is arithmetic nobody sees - and on a large
   * surface it is expensive arithmetic over its whole projected area. The
   * 220 m scrub plain beyond the fence is the case that forced the field:
   * authored with all three scales it cost a **12-second first-submission
   * stall** and failed the arena boot smoke outright, measured by bisecting
   * this build against the same build with that one material's wear stubbed.
   *
   * It is a READ distance, not a nearest approach, because those differ for
   * exactly the surfaces where it matters. A house wall is read at arm's
   * length: a player stands against it, so its 0.9 mm paint tooth is real
   * detail. The plain beyond the fence is a BACKDROP - it is behind a fence,
   * no route crosses it, and it is seen across the map. At the 55 m it is
   * actually read from, a 60 mm scuff is 1.8 of a pixel and a 1 mm grain is
   * 0.01, so neither is detail; only the metre-scale field it exists to
   * carry survives, which is what it was authored for.
   *
   * Defaults to 0.5 m - arm's length, the honest assumption for anything a
   * player can walk up to and put their face against.
   */
  readonly readDistanceM?: number;
  /** Optional coplanar tier, preserved verbatim from the shipped arena. */
  readonly polygonOffset?: number;
}

/**
 * Pixels a feature of `sizeM` subtends at `distanceM`.
 *
 * The arena's own camera: 37 degree vertical FOV over 1080 lines, so
 * `px = sizeM * 1080 / (2 * tan(18.5 deg) * distanceM)`.
 */
export function featurePixels(sizeM: number, distanceM: number): number {
  const CAMERA_LINES = 1080;
  const HALF_FOV_TAN = Math.tan((37 / 2) * (Math.PI / 180));
  return (sizeM * CAMERA_LINES) / (2 * HALF_FOV_TAN * distanceM);
}

/**
 * A feature narrower than this many pixels is a dither, not a feature.
 *
 * Two, not one: a one-pixel feature aliases into noise the moment the camera
 * moves, which is the thing the distance falloffs exist to prevent.
 */
export const MIN_FEATURE_PIXELS = 2;

/** Is this scale worth evaluating on a surface read from `readDistanceM`? */
export function scaleResolvable(sizeM: number, readDistanceM: number): boolean {
  return featurePixels(sizeM, readDistanceM) >= MIN_FEATURE_PIXELS;
}

/** The read distance a spec declares, or arm's length if it declares none. */
export function readDistance(spec: Nuketown2MaterialSpec): number {
  return spec.readDistanceM ?? 0.5;
}

/**
 * Total peak-to-peak albedo excursion a material can show.
 *
 * This is the number the per-family gates assert against 0.10. It is the sum
 * of the three symmetric scale swings plus the one-sided soiling term, i.e.
 * the darkest the surface ever gets versus the lightest, expressed as a
 * fraction of the base albedo.
 */
export function albedoWearStep(spec: Nuketown2MaterialSpec): number {
  const d = readDistance(spec);
  const term = (scale: WearScale): number => (scaleResolvable(scale.sizeM, d) ? scale.albedo : 0);
  return term(spec.grain) + term(spec.scuff) + term(spec.traffic) + spec.soil;
}

/**
 * The most a material ever darkens.
 *
 * COMBAT READABILITY BOUND. This is a shooter, not a photograph: a surface
 * that loses half its albedo to wear is a place an enemy disappears into. The
 * skill says the bound INVERTS for a competitive game — keep the physical rig
 * and the material discipline, re-meter for readability. 0.45 is that
 * re-metering, and `wear.ts` clamps the composed multiplier to it at runtime
 * rather than trusting the sum of the terms to behave.
 */
export function maxDarkening(spec: Nuketown2MaterialSpec): number {
  return albedoWearStep(spec);
}

/** The authored bands, in metres. Exported so the gates read them rather than restating them. */
export const WEAR_BANDS = Object.freeze({
  grain: Object.freeze({ minM: 0.0005, maxM: 0.0015 }),
  scuff: Object.freeze({ minM: 0.020, maxM: 0.080 }),
  traffic: Object.freeze({ minM: 0.5, maxM: 3.0 }),
});

/** Minimum visible albedo wear step. Below this the wear is a number in a file, not a thing in a frame. */
export const MIN_ALBEDO_WEAR_STEP = 0.10;

/** Readability ceiling: no surface may lose more than this fraction of its albedo to wear. */
export const MAX_ALBEDO_DARKENING = 0.45;

/**
 * Throws if a spec breaks a band or a bound.
 *
 * Called by every family builder at construction time, so a bad spec cannot
 * reach a frame even if someone adds one without adding a test row.
 */
export function assertSpec(spec: Nuketown2MaterialSpec): Nuketown2MaterialSpec {
  const band = (label: string, value: number, min: number, max: number): void => {
    if (!(value >= min && value <= max)) {
      throw new Error(`${spec.name}: ${label} ${value} m is outside the authored band ${min}..${max} m`);
    }
  };
  band('grain', spec.grain.sizeM, WEAR_BANDS.grain.minM, WEAR_BANDS.grain.maxM);
  band('scuff', spec.scuff.sizeM, WEAR_BANDS.scuff.minM, WEAR_BANDS.scuff.maxM);
  band('traffic', spec.traffic.sizeM, WEAR_BANDS.traffic.minM, WEAR_BANDS.traffic.maxM);
  const step = albedoWearStep(spec);
  if (step < MIN_ALBEDO_WEAR_STEP) {
    throw new Error(`${spec.name}: albedo wear step ${step.toFixed(3)} is below the ${MIN_ALBEDO_WEAR_STEP} visible floor`);
  }
  if (maxDarkening(spec) > MAX_ALBEDO_DARKENING) {
    throw new Error(`${spec.name}: peak darkening ${maxDarkening(spec).toFixed(3)} exceeds the ${MAX_ALBEDO_DARKENING} combat-readability ceiling`);
  }
  if (!(spec.roughness >= 0 && spec.roughness <= 1)) {
    throw new Error(`${spec.name}: roughness ${spec.roughness} out of range`);
  }
  if (!(spec.metalness >= 0 && spec.metalness <= 1)) {
    throw new Error(`${spec.name}: metalness ${spec.metalness} out of range`);
  }
  return spec;
}
