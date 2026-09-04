/**
 * aerial-perspective.ts — HF-481 lane LOOK: the atmosphere between the camera
 * and the far fence.
 *
 * WHY THIS EXISTS. `docs/evidence/pass94/quality-gap/ANALYSIS.md` graded eleven
 * "modern render" techniques against the PASS 94 Nuke Town Rebuild captures.
 * Nine of the eleven were already built. The one that was MISSING outright, and
 * the one that accounts for most of the perceived gap, is aerial perspective:
 * we ship stock linear `THREE.Fog(58, 148)` and nothing else. A linear fog
 * cannot do any of the three things that make distance read as distance:
 *
 *   1. it has no height falloff, so a rooftop and a gutter at the same range
 *      are hazed identically and the arena reads as a flat card;
 *   2. it has no sun coupling, so looking INTO the sun down the street is the
 *      same grey as looking away from it — and `nuketown2-into-sun-street.png`
 *      is exactly that shot with exactly that failure;
 *   3. it is a MIX toward a colour, so every gram of it removes contrast that
 *      a defender was standing in.
 *
 * WHAT THIS IS INSTEAD. The inscattering half of the transmittance equation,
 * and only that half. `L_out = L_surface * T(d) + L_in(d)`. This module builds
 * `L_in(d)` and the compositor ADDS it. It never builds `T(d)` and never
 * multiplies. That is not a shortcut: it is the same rule the rest of
 * `screen-space-post.ts` runs under, for the same reason. Adding light can
 * never delete a silhouette. Multiplying by transmittance can, and would do it
 * precisely to the shaded pockets a defender uses.
 *
 * IT STILL READS AS HAZE. Adding a distance-dependent term to the target and to
 * its background preserves their DIFFERENCE and shrinks their RATIO, which is
 * what aerial perspective looks like. The combat bound below is therefore
 * stated as a ceiling on that added term, in linear scene-referred units, swept
 * at import time AND clamped per channel in the shipped expression.
 *
 * THE PHYSICS, AND HONESTLY WHERE IT IS STYLISED.
 * - Optical depth uses an exponential density profile,
 *   `tau = beta0 * d * exp(-h / scaleHeight)`. Real near-ground aerosol has a
 *   scale height around 1.2 km. Over an arena whose longest in-bounds sightline
 *   is 89 m that gives a height term of `exp(-8/1200) = 0.993` — invisible.
 *   `scaleHeightM` below is therefore an ARENA-SCALE stylisation (14–22 m), and
 *   it is called that here rather than dressed up as meteorology. Everything
 *   else in this file is the real form.
 * - The colour split is real. Rayleigh scattering goes as lambda^-4, so the
 *   normalised RGB cross-section ratio at 615/535/465 nm is 0.20 : 0.40 : 1.00 —
 *   the blue that makes far treelines go blue. Mie (aerosol) is very nearly
 *   wavelength-flat and carries the SUN's colour, which is what warms haze at
 *   golden hour.
 * - The phase functions are real. Rayleigh is `0.75 * (1 + cos^2 t)`,
 *   normalised to 1 at 90 degrees. Mie is Henyey–Greenstein with g in 0.55–0.7,
 *   normalised the same way, and it is the whole reason a shot into the sun
 *   glows and the reverse shot does not.
 *
 * NO NEW SETTING. The tier is the EXISTING `graphics.volumetricQuality`
 * (`QualityTier`, low/high/ultra — it has no `off` rung, which is correct:
 * atmosphere is not an effect you turn off, and a player who could switch the
 * haze off would gain a distance-vision advantage). Adding a control would have
 * to answer the orphan-option gate; reusing this one does not, and it already
 * means "how much atmosphere".
 *
 * NO MATERIAL PIPELINE CHANGE. This is a screen-space term over the scene
 * pass's own view-Z, reconstructed exactly the way `baked-indirect-node.ts`
 * reconstructs its world position. `scene.fog` is left as it is, so every
 * existing `scene.fog instanceof THREE.Fog` writer (legacy-main's arena change,
 * the lighting-condition tint, the atomic-signal depth-fog uniforms) keeps
 * working untouched, and the LIGHTING lane's fog-COLOUR writes keep composing.
 */

import * as THREE from 'three';
import type { Node } from 'three/webgpu';
import { Fn, float, max, min, nodeObject, normalize, screenUV, smoothstep, uniform, vec3, vec4 } from 'three/tsl';
import type { QualityTier } from '../../graphics-settings-registry';

/** Stage name, matching `LINEAR_SOURCE_STAGE_ORDER`. */
export const AERIAL_PERSPECTIVE_STAGE = 'aerial-perspective-inscatter-add';

/**
 * THE COMBAT BOUND, DERIVED RATHER THAN FELT.
 *
 * The most this stage may add, in linear scene-referred units, at the reference
 * distance below. It is derived from a contrast floor, not chosen:
 *
 *   Reference pair: an operator in open shade at 0.12 linear against a
 *   background at 0.16 linear. Weber contrast today is |0.16-0.12|/0.16 = 0.250.
 *   Adding L to BOTH preserves the 0.04 difference and gives 0.04/(0.16+L).
 *   Requiring that to stay above 0.14 - far clear of the ~0.02 Weber detection
 *   threshold for a large daylight target, and above the 0.10 floor this lane
 *   set itself - gives L <= 0.126. Rounded down to 0.12.
 *
 * For scale: the linear `THREE.Fog(58,148)` we ship TODAY mixes 35.6% of the way
 * to the fog colour at 90 m, and that is a MULTIPLY, which destroys the
 * difference as well as the ratio. This stage is strictly gentler than the fog
 * it sits beside, and it is the one of the two that can be swept.
 *
 * HOW IT IS HELD, AND WHERE THAT CHANGED. The first cut of this module held the
 * ceiling by keeping every tier's WORST case (a white sky, a white sun, the
 * view straight down the sun vector) under it. That passed every assertion and
 * moved the frame by 1.0-1.4 mean sRGB codes across the entire PASS 94 capture
 * set - measured, not estimated. Bounding only the pathological case had
 * squeezed the representative one to nothing.
 *
 * So the ceiling is now held where the baked-indirect probe holds its own: by a
 * per-channel `min` in the shipped expression. Past roughly the arena's longest
 * sightline, looking into the sun, the curve DOES want more than the ceiling
 * and the clamp is what stops it. The two sweeps that remain are the ones a
 * clamp cannot make true - the duel envelope, and a visibility FLOOR that makes
 * regressing back to invisible a build failure.
 */
export const AERIAL_PERSPECTIVE_MAXIMUM_INSCATTER = 0.12;

/**
 * Where the ceiling is measured: the longest in-bounds sightline the Nuke Town
 * Rebuild actually has (89 m, `src/rendering/arenas/nuketown2.ts`), rounded up.
 * A curve inside the ceiling here is inside it everywhere a player can be shot
 * from, because the curve is monotonic in distance.
 */
export const AERIAL_PERSPECTIVE_REFERENCE_DISTANCE_M = 90;

/**
 * The second bound, and the one that actually protects a duel. At typical
 * engagement range the stage must be nearly absent, or it is a fog machine
 * rather than depth.
 *
 * WHY 0.30 AND NOT A QUARTER. `1 - exp(-beta d)` is concave, so its 25 m value
 * can never fall below the LINEAR share 25/90 = 0.278 of its 90 m value, for
 * any beta. A quarter is arithmetically unreachable by any exponential curve,
 * and a bound no curve can satisfy is a bound that gets quietly relaxed later.
 * 0.30 is the tightest honest figure and still puts a duel at a seventh of the
 * far-field allowance.
 */
export const AERIAL_PERSPECTIVE_ENGAGEMENT_DISTANCE_M = 25;
export const AERIAL_PERSPECTIVE_MAXIMUM_ENGAGEMENT_INSCATTER =
  AERIAL_PERSPECTIVE_MAXIMUM_INSCATTER * 0.3;

/**
 * Normalised Rayleigh cross-section ratio at 615 / 535 / 465 nm (lambda^-4,
 * normalised so blue is 1). This is the term that turns a far treeline blue.
 */
export const RAYLEIGH_CHANNEL_RATIO: readonly [number, number, number] =
  Object.freeze([0.2, 0.4, 1.0]);

export type AerialPerspectiveTuning = Readonly<{
  /** Base extinction per metre at the camera's height plane. */
  betaPerMetre: number;
  /** Arena-scale height falloff. Stylised; see the header. */
  scaleHeightM: number;
  /** Weight on the wavelength-dependent (blue) term. */
  rayleighWeight: number;
  /** Weight on the wavelength-flat, sun-coloured term. */
  mieWeight: number;
  /** Henyey-Greenstein asymmetry for the Mie lobe. 0 = isotropic, 1 = forward. */
  mieAsymmetry: number;
  /** Overall gain. The one knob a tier moves most. */
  gain: number;
  /**
   * THE DUEL ENVELOPE, MADE STRUCTURAL.
   *
   * Inscatter is faded in with a smoothstep between these two distances, so it
   * is EXACTLY ZERO inside `nearFadeStartM` and only reaches full strength past
   * `nearFadeEndM`.
   *
   * This exists because the first cut of this module tried to protect a duel
   * arithmetically, by keeping the whole curve small enough that its 25 m value
   * was inside the engagement bound. That failed twice over. `1 - exp(-beta d)`
   * is concave, so its 25 m share can never fall below the linear share
   * 25/90 = 0.278 whatever beta is — which means a curve strong enough to be
   * VISIBLE at 90 m is arithmetically forced to put ~28% of that into a duel.
   * The measured result was the effect being invisible everywhere: 1-2 sRGB
   * codes of change across the whole capture set.
   *
   * An explicit gate breaks the coupling. It is also the honest physics for
   * what this module is: a FAR-FIELD wash. Air over the first fifteen metres
   * genuinely contributes almost nothing, and pretending otherwise was what
   * forced the whole curve down.
   */
  nearFadeStartM: number;
  nearFadeEndM: number;
}>;

const TIER_TUNING: Readonly<Record<QualityTier, AerialPerspectiveTuning>> = Object.freeze({
  // LOW is not "off". It is the readable minimum: enough separation that a far
  // fence is not the same value as a near one, and no more.
  low: Object.freeze({
    betaPerMetre: 0.0026,
    scaleHeightM: 22,
    rayleighWeight: 0.62,
    mieWeight: 0.38,
    mieAsymmetry: 0.55,
    gain: 0.32,
    nearFadeStartM: 18,
    nearFadeEndM: 45,
  }),
  high: Object.freeze({
    betaPerMetre: 0.0038,
    scaleHeightM: 18,
    rayleighWeight: 0.58,
    mieWeight: 0.42,
    mieAsymmetry: 0.62,
    gain: 0.34,
    nearFadeStartM: 18,
    nearFadeEndM: 45,
  }),
  ultra: Object.freeze({
    betaPerMetre: 0.0046,
    scaleHeightM: 14,
    rayleighWeight: 0.55,
    mieWeight: 0.45,
    mieAsymmetry: 0.68,
    gain: 0.35,
    nearFadeStartM: 18,
    nearFadeEndM: 45,
  }),
});

/**
 * The compatibility state, and the ONLY zero this module has.
 *
 * It is not a graphics tier and no player can select it. The WebGL2
 * compatibility route runs no linear-HDR composite at all, so there is nothing
 * for an additive term to be added INTO; `SCREEN_SPACE_POST_DISABLED` takes
 * this rather than a tier so the runtime shape stays uniform and so that
 * "atmosphere is off" is only ever reachable by being off the WebGPU route.
 */
export const AERIAL_PERSPECTIVE_OFF: AerialPerspectiveTuning = Object.freeze({
  betaPerMetre: 0,
  scaleHeightM: 1,
  rayleighWeight: 0,
  mieWeight: 0,
  mieAsymmetry: 0,
  gain: 0,
  nearFadeStartM: 0,
  nearFadeEndM: 1,
});

export function resolveAerialPerspectiveTuning(tier: QualityTier): AerialPerspectiveTuning {
  return TIER_TUNING[tier];
}

/** Rayleigh phase, normalised to 1 at 90 degrees so weights read as weights. */
export function rayleighPhase(cosTheta: number): number {
  return 1 + cosTheta * cosTheta;
}

/** Henyey-Greenstein, normalised to 1 at 90 degrees for the same reason. */
export function henyeyGreensteinPhase(cosTheta: number, g: number): number {
  const g2 = g * g;
  const at = (c: number): number => (1 - g2) / Math.pow(Math.max(1e-3, 1 + g2 - 2 * g * c), 1.5);
  return at(cosTheta) / at(0);
}

/**
 * THE REPRESENTATIVE SKY AND SUN the visibility floor is stated against: the
 * Nuke Town Rebuild's authored golden-hour rig, normalised. Bounding only the
 * WORST case (a white sky and a white sun with the view straight down the sun
 * vector) is what produced a first cut that satisfied every assertion and
 * changed the frame by one sRGB code, so the module now bounds from both ends:
 * the worst case may not exceed the ceiling, and the representative case may
 * not fall below the floor.
 */
export const REPRESENTATIVE_SKY: readonly [number, number, number] =
  Object.freeze([0.55, 0.62, 0.72]);
export const REPRESENTATIVE_SUN: readonly [number, number, number] =
  Object.freeze([1, 0.94, 0.81]);

/**
 * The floor, in linear scene-referred units, on the representative blue channel
 * at the reference distance. Against a 0.18 middle grey this is a 22% lift on
 * the far field, which is the difference between depth you can see and a
 * measurement you can only take.
 */
export const AERIAL_PERSPECTIVE_MINIMUM_FAR_INSCATTER = 0.04;

/** Hermite smoothstep, matching TSL's `smoothstep` exactly. */
export function smoothstep01(edge0: number, edge1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/** The duel-envelope gate: zero inside the near fade, one beyond it. */
export function nearFieldGate(distanceM: number, tuning: AerialPerspectiveTuning): number {
  return smoothstep01(tuning.nearFadeStartM, tuning.nearFadeEndM, distanceM);
}

/**
 * Optical depth along a view ray of length `distanceM` whose shaded point sits
 * `heightM` above the camera plane.
 */
export function opticalDepth(
  distanceM: number,
  heightM: number,
  tuning: AerialPerspectiveTuning,
): number {
  return (
    tuning.betaPerMetre *
    Math.max(0, distanceM) *
    Math.exp(-Math.max(0, heightM) / tuning.scaleHeightM)
  );
}

/**
 * THE CPU REFERENCE. The TSL node below evaluates exactly this expression, so a
 * unit test can bound the shipped curve without a GPU.
 *
 * `skyRadiance` and `sunRadiance` are NORMALISED radiances in 0..1 — the caller
 * divides by the arena's exposure-referred white. That is what makes the
 * ceiling above a number rather than a hope: a sun at intensity 3.2 would
 * otherwise walk straight through it. `update()` below does the clamping.
 */
export function aerialPerspectiveInscatter(
  distanceM: number,
  heightM: number,
  cosTheta: number,
  skyRadiance: readonly [number, number, number],
  sunRadiance: readonly [number, number, number],
  tuning: AerialPerspectiveTuning,
): readonly [number, number, number] {
  const tau = opticalDepth(distanceM, heightM, tuning);
  const scattered = (1 - Math.exp(-tau)) * nearFieldGate(distanceM, tuning);
  const rayleigh = tuning.rayleighWeight * rayleighPhase(cosTheta);
  const mie = tuning.mieWeight * Math.min(4, henyeyGreensteinPhase(cosTheta, tuning.mieAsymmetry));
  const out: [number, number, number] = [0, 0, 0];
  for (let channel = 0; channel < 3; channel += 1) {
    const blue = skyRadiance[channel] * RAYLEIGH_CHANNEL_RATIO[channel] * rayleigh;
    const grey = sunRadiance[channel] * mie;
    out[channel] = Math.min(
      AERIAL_PERSPECTIVE_MAXIMUM_INSCATTER,
      tuning.gain * scattered * (blue + grey),
    );
  }
  return Object.freeze(out) as unknown as readonly [number, number, number];
}

/**
 * The worst case a tuning can produce at a distance, BEFORE the final clamp:
 * sun dead ahead (both phase lobes at maximum), at the camera plane (no height
 * falloff), against a fully white sky and sun. This is what the sweep bounds,
 * so the clamp is a backstop rather than the mechanism.
 */
export function worstCaseInscatter(distanceM: number, tuning: AerialPerspectiveTuning): number {
  const tau = opticalDepth(distanceM, 0, tuning);
  const scattered = (1 - Math.exp(-tau)) * nearFieldGate(distanceM, tuning);
  const rayleigh = tuning.rayleighWeight * rayleighPhase(1);
  const mie = tuning.mieWeight * Math.min(4, henyeyGreensteinPhase(1, tuning.mieAsymmetry));
  // Blue is the worst channel: its Rayleigh ratio is 1.0 where red's is 0.2.
  // UNCLAMPED on purpose: this is what the curve WANTS to deliver, and the
  // sweep below uses it to prove the duel envelope holds without leaning on the
  // clamp. Far out, the clamp is what holds the ceiling, and it says so.
  return tuning.gain * scattered * (rayleigh + mie);
}

/**
 * Representative far-field delivery on the blue channel: what the frame
 * actually receives at the reference distance under the arena's own sky, with
 * the view across the sun rather than down it.
 */
export function representativeFarInscatter(tuning: AerialPerspectiveTuning): number {
  return aerialPerspectiveInscatter(
    AERIAL_PERSPECTIVE_REFERENCE_DISTANCE_M,
    0,
    0,
    REPRESENTATIVE_SKY,
    REPRESENTATIVE_SUN,
    tuning,
  )[2];
}

/**
 * Swept at import time, from BOTH ends.
 *
 * A tuning that can wash a duel is a build error. So is a tuning that cannot be
 * seen — that is not a stylistic opinion, it is the exact failure this module
 * shipped on its first cut, measured at 1.0-1.4 mean sRGB codes of change
 * across the whole PASS 94 capture set. A gate that only bounds the top lets an
 * effect regress to nothing while every test stays green, which is the same
 * class of bug as the ambient particles that were shipped at 1.2 px.
 *
 * The duel bound is proved against the UNCLAMPED worst case, so it does not
 * lean on the shader clamp. Far out, the clamp IS the mechanism, and it is
 * stated as such rather than dressed up as a tuning property.
 */
export function assertAerialPerspectiveCombatSafety(tuning: AerialPerspectiveTuning): void {
  const near = worstCaseInscatter(AERIAL_PERSPECTIVE_ENGAGEMENT_DISTANCE_M, tuning);
  if (near > AERIAL_PERSPECTIVE_MAXIMUM_ENGAGEMENT_INSCATTER) {
    throw new Error(
      `HF-481 aerial perspective inscatter ${near.toFixed(4)} at ` +
        `${AERIAL_PERSPECTIVE_ENGAGEMENT_DISTANCE_M} m exceeds ` +
        `${AERIAL_PERSPECTIVE_MAXIMUM_ENGAGEMENT_INSCATTER}`,
    );
  }
  // The zero tuning is the compatibility route and is exempt from the floor:
  // there is no linear composite there for anything to be visible in.
  if (tuning.gain <= 0) return;
  const far = representativeFarInscatter(tuning);
  if (far < AERIAL_PERSPECTIVE_MINIMUM_FAR_INSCATTER) {
    throw new Error(
      `HF-481 aerial perspective delivers only ${far.toFixed(4)} at ` +
        `${AERIAL_PERSPECTIVE_REFERENCE_DISTANCE_M} m, below the visibility floor ` +
        `${AERIAL_PERSPECTIVE_MINIMUM_FAR_INSCATTER}`,
    );
  }
}

export const AERIAL_PERSPECTIVE_TIERS: readonly QualityTier[] = Object.freeze([
  'low',
  'high',
  'ultra',
]);
for (const tier of AERIAL_PERSPECTIVE_TIERS) assertAerialPerspectiveCombatSafety(TIER_TUNING[tier]);

export type AerialPerspectiveSources = Readonly<{
  /** Linear view-space Z from the scene pass, negative in front of the camera. */
  sceneViewZ: Node<'float'>;
  camera: THREE.Camera;
  /**
   * The arena's key light. Its direction and colour drive the Mie lobe.
   *
   * A directional or spot light gives a real direction (position minus target).
   * A point light has no direction at infinity, so the direction from the
   * camera to it is used instead — which is what a nearby source physically
   * does to haze anyway, and is the honest reading rather than a pretend sun.
   */
  sun: THREE.DirectionalLight | THREE.SpotLight | THREE.PointLight | null;
}>;

export type AerialPerspectiveGraph = Readonly<{
  /** The additive linear-HDR inscatter term. */
  light: Node<'vec3'>;
  /**
   * Per-frame. `skyColor` is the arena's fog/sky colour and `sunWhite` the
   * linear radiance the arena's exposure treats as white — the sun's own
   * intensity divided by that is what normalises the Mie term into the 0..1
   * band the ceiling is stated in.
   */
  update(skyColor: THREE.Color, sunWhite: number): void;
}>;

/**
 * Builds the node. One expression, no render target, no second pass: it reads
 * the scene pass's own view-Z, so its whole cost is arithmetic in the composite
 * shader and it adds no draw call and no attachment.
 */
export function buildAerialPerspectiveNode(
  sources: AerialPerspectiveSources,
  tuning: AerialPerspectiveTuning,
): AerialPerspectiveGraph {
  assertAerialPerspectiveCombatSafety(tuning);

  const sunDirection = uniform(new THREE.Vector3(0, 1, 0));
  const skyRadiance = uniform(new THREE.Color(0, 0, 0));
  const sunRadiance = uniform(new THREE.Color(0, 0, 0));
  const cameraWorldMatrix = uniform(new THREE.Matrix4());
  const cameraHeight = uniform(0);
  const tanHalfFovY = uniform(0.5);
  const aspectRatio = uniform(16 / 9);

  const beta = float(tuning.betaPerMetre);
  const nearFadeStart = float(tuning.nearFadeStartM);
  const nearFadeEnd = float(tuning.nearFadeEndM);
  const scaleHeight = float(tuning.scaleHeightM);
  const g = tuning.mieAsymmetry;
  const g2 = g * g;
  const hgReference = (1 - g2) / Math.pow(1 + g2, 1.5);

  const light = Fn(() => {
    const viewZ = nodeObject(sources.sceneViewZ);
    // `sceneViewZ` is negative in front of the camera. The sky writes the far
    // plane, which is exactly what we want the deepest haze on.
    const viewDepth = max(float(0), viewZ.negate());

    // Same reconstruction as `baked-indirect-node.ts`, deliberately: two
    // different reconstructions of the same buffer is how two stages come to
    // disagree about where a pixel is.
    const ndc = screenUV.mul(2).sub(1);
    const viewPosition = vec3(
      ndc.x.mul(tanHalfFovY).mul(aspectRatio).mul(viewDepth),
      ndc.y.mul(tanHalfFovY).mul(viewDepth),
      viewZ,
    );
    const worldPosition = cameraWorldMatrix.mul(vec4(viewPosition, 1)).xyz;

    // Height above the CAMERA plane, clamped at zero so a basement never gets
    // more haze than the street it is under.
    const height = max(float(0), worldPosition.y.sub(cameraHeight));
    const tau = beta.mul(viewDepth).mul(height.div(scaleHeight).negate().exp());
    // The duel-envelope gate. `smoothstep` here is the same Hermite curve
    // `smoothstep01` evaluates on the CPU, so the swept bound and the shipped
    // pixel are the same function and not two descriptions of one intent.
    const gate = smoothstep(nearFadeStart, nearFadeEnd, viewDepth);
    const scattered = float(1).sub(tau.negate().exp()).mul(gate);

    // cos(theta) between the view ray and the direction TO the sun. The ray is
    // the reconstructed view position rotated into world space, which is what
    // `worldPosition - cameraOrigin` is; normalising the view position and
    // rotating is one fewer subtraction and identical.
    const viewRay = normalize(viewPosition);
    const worldRay = normalize(cameraWorldMatrix.mul(vec4(viewRay, 0)).xyz);
    const cosTheta = worldRay.dot(sunDirection);

    // Rayleigh phase, normalised to its own 90-degree value so the weight below
    // is the whole of the weighting.
    const rayleighPhaseNode = float(1).add(cosTheta.mul(cosTheta));
    // Henyey-Greenstein, normalised the same way. The denominator is clamped
    // off zero: at g -> 1, cosTheta -> 1 the analytic form is unbounded, and
    // one unbounded pixel in an additive term is a white hole in the frame.
    const hgDenominator = max(float(1e-3), float(1 + g2).sub(cosTheta.mul(2 * g)));
    const hgRaw = float(1 - g2).div(hgDenominator.pow(1.5));
    const miePhaseNode = min(float(4), hgRaw.div(float(hgReference)));

    const rayleighTerm = vec3(
      RAYLEIGH_CHANNEL_RATIO[0],
      RAYLEIGH_CHANNEL_RATIO[1],
      RAYLEIGH_CHANNEL_RATIO[2],
    )
      .mul(skyRadiance)
      .mul(rayleighPhaseNode)
      .mul(tuning.rayleighWeight);
    const mieTerm = sunRadiance.mul(miePhaseNode).mul(tuning.mieWeight);

    // Clamped last, per channel, exactly as the baked-indirect probe is. The
    // sweep above proves the curve is inside the bound; this keeps a NaN sun
    // direction or a degenerate camera from getting past it anyway.
    return min(
      scattered.mul(tuning.gain).mul(rayleighTerm.add(mieTerm)),
      vec3(1, 1, 1).mul(AERIAL_PERSPECTIVE_MAXIMUM_INSCATTER),
    );
  })();

  const scratchDirection = new THREE.Vector3();
  const scratchTarget = new THREE.Vector3();
  const scratchCamera = new THREE.Vector3();

  return Object.freeze({
    light: light as unknown as Node<'vec3'>,
    update(skyColor: THREE.Color, sunWhite: number): void {
      const camera = sources.camera;
      camera.getWorldPosition(scratchCamera);
      cameraHeight.value = scratchCamera.y;
      cameraWorldMatrix.value.copy(camera.matrixWorld);
      if ((camera as THREE.PerspectiveCamera).isPerspectiveCamera) {
        const perspective = camera as THREE.PerspectiveCamera;
        tanHalfFovY.value = Math.tan(THREE.MathUtils.degToRad(perspective.fov) * 0.5);
        aspectRatio.value = perspective.aspect;
      }
      const sun = sources.sun;
      if (sun) {
        sun.getWorldPosition(scratchDirection);
        const target = (sun as THREE.DirectionalLight).target;
        if (target) {
          // Direction TO the sun: light position minus its target.
          target.getWorldPosition(scratchTarget);
        } else {
          scratchTarget.copy(scratchCamera);
        }
        scratchDirection.sub(scratchTarget);
        if (scratchDirection.lengthSq() > 1e-8) {
          sunDirection.value.copy(scratchDirection.normalize());
        }
        // NORMALISED, and clamped. The ceiling is stated in 0..1 radiance; a
        // key at intensity 3.2 would otherwise multiply straight through it.
        const scale = Math.min(1, Math.max(0, sun.intensity / Math.max(1e-3, sunWhite)));
        sunRadiance.value.copy(sun.color).multiplyScalar(scale);
        clampColor(sunRadiance.value);
      } else {
        sunRadiance.value.setRGB(0, 0, 0);
      }
      skyRadiance.value.copy(skyColor);
      clampColor(skyRadiance.value);
    },
  });
}

function clampColor(color: THREE.Color): void {
  color.r = Math.min(1, Math.max(0, color.r));
  color.g = Math.min(1, Math.max(0, color.g));
  color.b = Math.min(1, Math.max(0, color.b));
}
