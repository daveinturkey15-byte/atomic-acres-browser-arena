/**
 * combat-readability.ts — HF-371: the rules that make particles safe to fight in.
 *
 * WHY THIS IS A SEPARATE MODULE
 * "Don't obscure the enemy" written in a design doc is a hope. Written as a
 * function that every particle in the engine is forced through, on a code path
 * with no override parameter and no caller-supplied exemption, it is a
 * guarantee. So the guards live here, alone, as pure number-in/number-out
 * functions: no THREE, no state, no allocation. `particle-field.ts` calls them
 * for every live particle of every family, and there is deliberately no way for
 * an emitter to ask for an exception — `emitMuzzleSmoke` is subject to exactly
 * the same cone as a drifting leaf.
 *
 * THE FOUR GUARDS
 *
 * 1. THE CENTRE CONE IS ANGULAR, NOT METRIC.
 *    A puff 3 m away and a puff 40 m away that both sit on the crosshair cover
 *    the same part of the screen, so a metric radius is the wrong shape for the
 *    problem. The protected volume is a cone about the view axis: a fixed
 *    HALF-ANGLE, which means a fixed fraction of screen width at every range.
 *    Inside it, obscuring families are cleared outright and fine families are
 *    reduced to `centreFineFloor`. The edge is a smoothstep shell, not a step,
 *    because a particle that pops out of existence as you turn is more
 *    distracting than the particle was.
 *
 * 2. THE CONE WIDENS WHEN YOU AIM.
 *    ADS is the moment the player has committed to a target, so the protected
 *    cone grows by `centreAdsWiden`. You cannot lose a target behind something
 *    you were looking through, which is the same rule rain-presentation.ts
 *    applies to streaks.
 *
 * 3. NOTHING NEAR THE LENS, EVER.
 *    A puff at 20 cm is not an effect, it is a blindfold: a 0.4 m sphere at
 *    that range covers most of the viewport. Anything closer than `nearCullM`
 *    is not drawn at all, at any opacity, in any family.
 *
 * 4. OPTIONAL SIGHTLINE CLEARING FOR ENEMIES OFF THE AIM AXIS.
 *    Guard 1 protects where you are LOOKING. An enemy you have not centred yet
 *    is not covered by it, so the runtime may hand in up to
 *    `maxProtectedTargets` world positions and obscuring particles fade out of
 *    the eye-to-target cylinder. It is opt-in because it costs
 *    (obscuring particles x targets) point-segment tests, and it is bounded so
 *    that cost can be stated rather than discovered.
 *
 * AND ONE BUDGET
 * Individually-legal particles can still white out a doorway when thirty of
 * them stack. `screenLoadScale` closes that: the field sums each obscuring
 * particle's approximate solid angle x opacity, and above `screenLoadCeiling`
 * every obscuring particle is scaled down proportionally. Thirty puffs are
 * DENSER than three, but never BRIGHTER than the ceiling. This mirrors the
 * `overlayLoad` cap in `src/feel/index.ts`, for the same reason.
 *
 * ADDITIVE BLENDING IS ITSELF A GUARD
 * Every soft family in this system is additively blended, which means it can
 * only ever ADD light to a pixel. There is no code path by which this system
 * can darken a silhouette, and an enemy against sky or wall keeps its luminance
 * edge. The one alpha-tested family (`grit`) is millimetre-scale chips, and it
 * is bound by guards 1-3 through SCALE rather than opacity — see
 * `visibilityToScaleGate`.
 */

/** Every geometric guard in one frozen table. All distances are metres. */
export const PARTICLE_READABILITY = Object.freeze({
  /** Nothing is drawn closer than this to the eye, in any family. */
  nearCullM: 0.35,
  /**
   * Tangent of the protected cone's half-angle at the hip. 0.1145 is ~6.53
   * degrees, i.e. about a sixth of screen width on a 75-degree horizontal FOV.
   */
  centreTanHalfAngle: 0.1145,
  /**
   * Floor on the cone radius. A pure cone pinches to nothing at the eye, which
   * would let a puff sit 40 cm off-axis at arm's length and fill the view.
   */
  centreMinRadiusM: 0.55,
  /** Fractional widening of the cone at full ADS. */
  centreAdsWiden: 0.85,
  /** Inside this fraction of the cone radius the clearance is at its floor. */
  centreCoreFraction: 0.62,
  /** Floor multiplier for NON-obscuring families inside the cone. */
  centreFineFloor: 0.3,
  /** Radius of the cleared cylinder around an eye-to-enemy sightline. */
  sightlineRadiusM: 1.15,
  /** Inside this fraction of the sightline radius, obscuring families are 0. */
  sightlineCoreFraction: 0.55,
  /** Hard bound on protected sightlines, so the per-frame cost is stateable. */
  maxProtectedTargets: 8,
  /**
   * Absolute opacity ceiling for any family flagged `obscuring`. No catalog
   * entry may author above this; `auditFamilyOpacityCeilings` fails if one does.
   */
  obscuringMaxOpacity: 0.24,
  /** Absolute opacity ceiling for fine, non-obscuring families. */
  fineMaxOpacity: 0.16,
  /** Summed (solid angle x opacity) allowed across obscuring particles. */
  screenLoadCeiling: 0.16,
  /** The load scale never collapses the effect entirely; it thins it. */
  minLoadScale: 0.22,
  /**
   * Below this alpha a particle is written at zero scale instead of being
   * drawn. Degenerate triangles cost no fill rate, and the instance stays in
   * the buffer so the draw count never changes.
   */
  minDrawAlpha: 0.002,
  /**
   * Alpha-tested families cannot fade per instance (no per-instance alpha on a
   * stock material, and this repo does not ship custom GLSL). They obey the
   * same guards through scale: below this clearance they are not drawn.
   */
  scaleGateClearance: 0.5,
} as const);

/** Clamp helper shared by the guards. Also normalises NaN to the low bound. */
export function clamp(value: number, low: number, high: number): number {
  if (!Number.isFinite(value)) return low;
  return value < low ? low : value > high ? high : value;
}

/** 0..1 clamp with NaN -> 0, matching `clamp01` elsewhere in the repo. */
export function clamp01(value: number): number {
  return clamp(value, 0, 1);
}

/** Hermite smoothstep on an already-normalised 0..1 input. */
export function smoothstep01(value: number): number {
  const t = clamp01(value);
  return t * t * (3 - 2 * t);
}

/**
 * Radius of the protected cone at `alongM` metres down the view axis.
 * Grows linearly with range (constant screen angle) above a near-field floor.
 */
export function centreConeRadius(alongM: number, adsProgress = 0): number {
  const ads = clamp01(adsProgress);
  const tan = PARTICLE_READABILITY.centreTanHalfAngle
    * (1 + PARTICLE_READABILITY.centreAdsWiden * ads);
  const along = Math.max(0, Number.isFinite(alongM) ? alongM : 0);
  return Math.max(PARTICLE_READABILITY.centreMinRadiusM, tan * along);
}

/**
 * Visibility multiplier (0..1) for a particle at `alongM` down the view axis
 * and `perpM` off it.
 *
 * `obscuring` selects the floor: families big enough to hide a torso go to
 * zero, fine specks are merely thinned, because clearing a hole in the dust
 * straight ahead is itself a visible artefact and fine dust cannot hide anyone.
 */
export function centreVisibility(
  alongM: number,
  perpM: number,
  adsProgress: number,
  obscuring: boolean,
): number {
  const along = Number.isFinite(alongM) ? alongM : 0;
  // Behind the eye: nothing to protect, and the cone maths is meaningless.
  if (along <= 0) return 1;
  const radius = centreConeRadius(along, adsProgress);
  const perp = Math.max(0, Number.isFinite(perpM) ? perpM : 0);
  const ratio = perp / radius;
  if (ratio >= 1) return 1;
  const floor = obscuring ? 0 : PARTICLE_READABILITY.centreFineFloor;
  const core = PARTICLE_READABILITY.centreCoreFraction;
  if (ratio <= core) return floor;
  // Smooth shell between the core and the cone wall.
  return floor + (1 - floor) * smoothstep01((ratio - core) / (1 - core));
}

/**
 * Visibility multiplier for a particle near the eye-to-target segment.
 * Pure scalar maths on raw components so the hot loop never builds a Vector3.
 */
export function sightlineVisibility(
  px: number, py: number, pz: number,
  eyeX: number, eyeY: number, eyeZ: number,
  targetX: number, targetY: number, targetZ: number,
  radiusM: number = PARTICLE_READABILITY.sightlineRadiusM,
): number {
  const segX = targetX - eyeX;
  const segY = targetY - eyeY;
  const segZ = targetZ - eyeZ;
  const segLengthSq = segX * segX + segY * segY + segZ * segZ;
  if (!(segLengthSq > 1e-6)) return 1;

  const relX = px - eyeX;
  const relY = py - eyeY;
  const relZ = pz - eyeZ;
  // Projection parameter, clamped to the segment: a particle behind the player
  // or beyond the enemy is not on the sightline, it is merely near the line.
  let t = (relX * segX + relY * segY + relZ * segZ) / segLengthSq;
  t = t < 0 ? 0 : t > 1 ? 1 : t;

  const dx = relX - segX * t;
  const dy = relY - segY * t;
  const dz = relZ - segZ * t;
  const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);

  const radius = radiusM > 0 ? radiusM : PARTICLE_READABILITY.sightlineRadiusM;
  const ratio = distance / radius;
  if (ratio >= 1) return 1;
  const core = PARTICLE_READABILITY.sightlineCoreFraction;
  if (ratio <= core) return 0;
  return smoothstep01((ratio - core) / (1 - core));
}

/**
 * Approximate screen load contributed by one obscuring particle: opacity times
 * solid angle, where solid angle goes as (radius / distance)^2. The absolute
 * scale is arbitrary; only its ratio to `screenLoadCeiling` is used, and both
 * sides of that comparison come from this one function.
 */
export function particleScreenLoad(opacity: number, radiusM: number, distanceSq: number): number {
  if (!(opacity > 0) || !(radiusM > 0)) return 0;
  const safeDistanceSq = Math.max(0.25, Number.isFinite(distanceSq) ? distanceSq : 0.25);
  return opacity * (radiusM * radiusM) / safeDistanceSq;
}

/**
 * Global thinning factor for obscuring families given last frame's summed load.
 *
 * ONE-FRAME LAG, ON PURPOSE. Scaling this frame's particles by this frame's
 * total would need two passes over every particle, or an allocation to stage
 * the results. A single frame of lag on a smoke thinning ramp is not visible;
 * a second pass over 150 puffs every frame is measurable. The lag is bounded
 * because the scale is itself bounded below by `minLoadScale`.
 */
export function screenLoadScale(load: number): number {
  const total = Math.max(0, Number.isFinite(load) ? load : 0);
  const ceiling = PARTICLE_READABILITY.screenLoadCeiling;
  if (total <= ceiling) return 1;
  return Math.max(PARTICLE_READABILITY.minLoadScale, ceiling / total);
}

/**
 * Turns a 0..1 clearance into a hard draw/don't-draw decision for families that
 * have no per-instance alpha. Used by `grit`, which is alpha-tested chips.
 */
export function visibilityToScaleGate(visibility: number): number {
  return clamp01(visibility) >= PARTICLE_READABILITY.scaleGateClearance ? 1 : 0;
}

export type FamilyOpacityClaim = Readonly<{ id: string; obscuring: boolean; maxOpacity: number }>;

export type OpacityCeilingAudit = Readonly<{
  offenders: readonly string[];
  pass: boolean;
}>;

/**
 * Mutation gate for the catalog: an authored family may not raise its own
 * ceiling above the contract. A test runs this over the shipped family table,
 * so raising a number in the catalog fails the build rather than the playtest.
 */
export function auditFamilyOpacityCeilings(
  claims: readonly FamilyOpacityClaim[],
): OpacityCeilingAudit {
  const offenders = claims
    .filter((claim) => {
      const ceiling = claim.obscuring
        ? PARTICLE_READABILITY.obscuringMaxOpacity
        : PARTICLE_READABILITY.fineMaxOpacity;
      return !(claim.maxOpacity > 0) || claim.maxOpacity > ceiling;
    })
    .map((claim) => claim.id)
    .sort();
  return Object.freeze({ offenders: Object.freeze(offenders), pass: offenders.length === 0 });
}

export type CombatSafetyProbe = Readonly<{
  /** Metres down the view axis. */
  alongM: number;
  /** Metres off the view axis. */
  perpM: number;
  /** Straight-line distance from the eye. */
  distanceM: number;
  adsProgress: number;
  obscuring: boolean;
  /** Opacity the family wants BEFORE the guards are applied. */
  requestedOpacity: number;
  radiusM: number;
}>;

export type CombatSafetyVerdict = Readonly<{
  /** Opacity actually permitted after every guard. */
  opacity: number;
  visibility: number;
  nearCulled: boolean;
  /** True when this probe may be drawn at all. */
  drawn: boolean;
  /** Human-readable reason a probe was suppressed, for test failure messages. */
  reason: string | null;
}>;

/**
 * The guards, applied in order, as one auditable function. `particle-field.ts`
 * inlines this maths in its hot loop; this is the specification that loop is
 * tested against, and the shape a reviewer can read without a profiler.
 */
export function combatSafetyVerdict(probe: CombatSafetyProbe): CombatSafetyVerdict {
  const distance = Math.max(0, Number.isFinite(probe.distanceM) ? probe.distanceM : 0);
  if (distance < PARTICLE_READABILITY.nearCullM) {
    return Object.freeze({
      opacity: 0,
      visibility: 0,
      nearCulled: true,
      drawn: false,
      reason: 'near-lens-cull',
    });
  }
  const visibility = centreVisibility(probe.alongM, probe.perpM, probe.adsProgress, probe.obscuring);
  const ceiling = probe.obscuring
    ? PARTICLE_READABILITY.obscuringMaxOpacity
    : PARTICLE_READABILITY.fineMaxOpacity;
  const opacity = Math.min(ceiling, clamp01(probe.requestedOpacity) * visibility);
  const drawn = opacity >= PARTICLE_READABILITY.minDrawAlpha;
  return Object.freeze({
    opacity,
    visibility,
    nearCulled: false,
    drawn,
    reason: drawn ? null : 'below-min-draw-alpha',
  });
}
