/**
 * HF-398 — the four classic ray-tracing material types, and the rule that
 * decides which one a real arena surface gets.
 *
 * PROVENANCE. This is an independent TypeScript implementation of the classic
 * recursive ray-tracing material model documented by the technique register's
 * row 19 source (`erichlof/THREE.js-RayTracing-Renderer` @
 * `490ca0817ce31781df2cd36af2edcc2f36d9dfcc`, CC0-1.0 verified by reading the
 * LICENSE file). CC0 is a public-domain dedication with no attribution
 * condition, so that source is the one entry in the register whose code may be
 * adapted directly rather than merely restated. Nothing here uses the author's
 * name or project name to imply endorsement, which is the one thing CC0's
 * section 4a trademark carve-out still withholds. The maths below is ours to
 * own, debug and maintain, and it is validated against the Three.js revision
 * this repository actually installs rather than the revision upstream targets.
 *
 * WHAT THIS MODEL IS, STATED SO NOBODY HAS TO GUESS:
 * Whitted-style recursive ray tracing (1980) with the Hall shading model
 * (1983). Rays leave the camera, recurse at reflective and refractive surfaces
 * and cast shadow rays at lights.
 *   - It is NOT path tracing. There is no diffuse colour bleeding and there are
 *     no physically-accurate photon-mapped caustics.
 *   - It is NOT hardware ray tracing. No browser exposes a ray-tracing
 *     pipeline, acceleration structures or ray queries, so RT cores are not
 *     addressable from a tab and no code path here asks for them.
 *   - It HAS true reflections, true refractions, pixel-perfect shadows, the
 *     shadow-ray caustics that survive refraction through a transparent object,
 *     Fresnel, and aperture depth of field.
 * The missing indirect bounce is supplied by the existing baked/probe
 * environment (`arena-environment-ibl.ts`), never by raising a flat ambient
 * constant — see `raytracing-profile.ts` for the assertion that pins that.
 *
 * WHY THE CLASSIFIER EXISTS. Upstream authors a scene FOR the tracer, choosing
 * a material type per mesh by hand. Our arenas are authored for a rasterizer
 * and are owned by other lanes, so the surface class has to be DERIVED from
 * what the arena already publishes — the packed metalness/roughness attachment
 * and the surface normal. That derivation is a rule table with one defensible
 * sentence per row, and it is where combat readability is enforced, because
 * "which surfaces are mirrors" is exactly the decision that makes an enemy hard
 * or easy to see.
 */

/** The four material types classic ray tracing distinguishes. */
export type WhittedMaterialType = 'phong' | 'metal' | 'clearcoat' | 'transparent';

/** A minimal vector, deliberately not THREE.Vector3: this module stays pure. */
export type Vec3 = readonly [number, number, number];

export function vec3(x: number, y: number, z: number): Vec3 {
  return Object.freeze([x, y, z] as const);
}

export function dot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

export function scale(a: Vec3, k: number): Vec3 {
  return vec3(a[0] * k, a[1] * k, a[2] * k);
}

export function add(a: Vec3, b: Vec3): Vec3 {
  return vec3(a[0] + b[0], a[1] + b[1], a[2] + b[2]);
}

export function sub(a: Vec3, b: Vec3): Vec3 {
  return vec3(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

export function length(a: Vec3): number {
  return Math.sqrt(dot(a, a));
}

export function normalize(a: Vec3): Vec3 {
  const magnitude = length(a);
  return magnitude > 1e-9 ? scale(a, 1 / magnitude) : vec3(0, 0, 0);
}

// ---------------------------------------------------------------------------
// Fresnel
// ---------------------------------------------------------------------------

/**
 * Schlick's approximation. `cosTheta` is the cosine between the incident
 * direction and the surface normal, already clamped to the front face.
 *
 * This is the term that makes ClearCoat the best beauty-per-cost material in
 * the set: it is what gives a lacquered or wet surface its grazing-angle rim
 * without turning the surface into a mirror when you look straight at it.
 */
export function schlickFresnel(cosTheta: number, normalReflectance: number): number {
  const cosine = Math.min(1, Math.max(0, cosTheta));
  const f0 = Math.min(1, Math.max(0, normalReflectance));
  return f0 + (1 - f0) * (1 - cosine) ** 5;
}

/**
 * Exact unpolarised dielectric Fresnel, used for Transparent surfaces where
 * Schlick visibly under-reflects near the critical angle — which is precisely
 * the angle range a glass pane in a doorway is seen at. Returns the reflected
 * fraction; the transmitted fraction is `1 - result`. Total internal reflection
 * returns exactly 1.
 */
export function dielectricFresnel(cosTheta: number, indexOfRefraction: number): number {
  const cosine = Math.min(1, Math.max(0, cosTheta));
  const eta = indexOfRefraction > 0 ? indexOfRefraction : 1;
  const sinTransmitted2 = (1 / eta) ** 2 * (1 - cosine * cosine);
  if (sinTransmitted2 >= 1) return 1;
  const cosTransmitted = Math.sqrt(1 - sinTransmitted2);
  const parallel = (eta * cosine - cosTransmitted) / (eta * cosine + cosTransmitted);
  const perpendicular = (cosine - eta * cosTransmitted) / (cosine + eta * cosTransmitted);
  return Math.min(1, (parallel * parallel + perpendicular * perpendicular) * 0.5);
}

/** Mirror reflection of an incident direction about a unit normal. */
export function reflect(incident: Vec3, normal: Vec3): Vec3 {
  return sub(incident, scale(normal, 2 * dot(incident, normal)));
}

/**
 * Snell refraction. Returns `null` on total internal reflection so callers must
 * decide what to do rather than silently receiving a zero vector — a zero
 * direction is how a refraction bug turns into a black hole in the glass.
 */
export function refract(incident: Vec3, normal: Vec3, etaRatio: number): Vec3 | null {
  const cosIncident = -Math.min(1, Math.max(-1, dot(incident, normal)));
  const sinTransmitted2 = etaRatio * etaRatio * (1 - cosIncident * cosIncident);
  if (sinTransmitted2 > 1) return null;
  const cosTransmitted = Math.sqrt(1 - sinTransmitted2);
  return normalize(add(
    scale(incident, etaRatio),
    scale(normal, etaRatio * cosIncident - cosTransmitted),
  ));
}

// ---------------------------------------------------------------------------
// Material definitions
// ---------------------------------------------------------------------------

export type WhittedMaterial = Readonly<{
  type: WhittedMaterialType;
  /** Linear base colour. For Metal this also tints the mirror. */
  albedo: Vec3;
  /** Normal-incidence reflectance used by the Schlick term. */
  normalReflectance: number;
  /** Blinn-Phong specular exponent for the direct highlight. */
  specularExponent: number;
  /** Whether this surface spawns a reflection ray at all. */
  spawnsReflectionRay: boolean;
  /** Whether this surface spawns a refraction ray at all. */
  spawnsRefractionRay: boolean;
  /** Index of refraction; only meaningful when `spawnsRefractionRay`. */
  indexOfRefraction: number;
  /** Beer-Lambert absorption per metre of path inside a transparent volume. */
  absorptionPerMetre: Vec3;
}>;

/**
 * Dielectric normal-incidence reflectance. 0.04 is the standard value for the
 * common dielectrics an arena is made of, and it is the same figure the PBR
 * materials already in this project use, so a ClearCoat surface and the
 * rasterized version of the same surface agree at normal incidence.
 */
export const DIELECTRIC_NORMAL_REFLECTANCE = 0.04;

/** Ordinary window/architectural glass. */
export const GLASS_INDEX_OF_REFRACTION = 1.52;

/** Water, for shallow standing water and puddles over asphalt. */
export const WATER_INDEX_OF_REFRACTION = 1.333;

export function phongMaterial(albedo: Vec3, specularExponent = 48): WhittedMaterial {
  return Object.freeze({
    type: 'phong' as const,
    albedo,
    normalReflectance: DIELECTRIC_NORMAL_REFLECTANCE,
    specularExponent,
    spawnsReflectionRay: false,
    spawnsRefractionRay: false,
    indexOfRefraction: 1,
    absorptionPerMetre: vec3(0, 0, 0),
  });
}

export function metalMaterial(albedo: Vec3, specularExponent = 256): WhittedMaterial {
  return Object.freeze({
    type: 'metal' as const,
    albedo,
    // A conductor's F0 IS its colour. That is the whole reason a gold mirror
    // reflects gold and a chrome mirror reflects white.
    normalReflectance: Math.max(albedo[0], albedo[1], albedo[2]),
    specularExponent,
    spawnsReflectionRay: true,
    spawnsRefractionRay: false,
    indexOfRefraction: 1,
    absorptionPerMetre: vec3(0, 0, 0),
  });
}

export function clearCoatMaterial(albedo: Vec3, specularExponent = 160): WhittedMaterial {
  return Object.freeze({
    type: 'clearcoat' as const,
    albedo,
    normalReflectance: DIELECTRIC_NORMAL_REFLECTANCE,
    specularExponent,
    spawnsReflectionRay: true,
    spawnsRefractionRay: false,
    indexOfRefraction: 1,
    absorptionPerMetre: vec3(0, 0, 0),
  });
}

export function transparentMaterial(
  albedo: Vec3,
  indexOfRefraction = GLASS_INDEX_OF_REFRACTION,
  absorptionPerMetre: Vec3 = vec3(0.02, 0.014, 0.02),
): WhittedMaterial {
  return Object.freeze({
    type: 'transparent' as const,
    albedo,
    normalReflectance: ((indexOfRefraction - 1) / (indexOfRefraction + 1)) ** 2,
    specularExponent: 512,
    spawnsReflectionRay: true,
    spawnsRefractionRay: true,
    indexOfRefraction,
    absorptionPerMetre,
  });
}

// ---------------------------------------------------------------------------
// Surface classification — the design decision, expressed as a rule table
// ---------------------------------------------------------------------------

/**
 * What the classifier is given about a real arena surface. Every field is
 * something the existing rasterized frame already publishes, because the arena
 * sources are owned by other lanes and may not be re-authored for this preset.
 */
export type SurfaceSample = Readonly<{
  /** Packed MRT metalness, 0..1. */
  metalness: number;
  /** Packed MRT roughness, 0..1. */
  roughness: number;
  /** World-space normal, unit length. */
  worldNormal: Vec3;
  /** World-space height of the shaded point above the arena floor, in metres. */
  heightM: number;
  /**
   * How much of the frame this contiguous surface covers, 0..1. A single huge
   * flat wall and twenty small props are the same "count of objects" and
   * radically different costs and readability risks, so the budget is screen
   * area, never object count.
   */
  screenAreaFraction: number;
  /** Whether the surface carries a water/wet flag from the weather system. */
  wet: boolean;
}>;

/**
 * The player's eye line. Anything mirror-flat and vertical between the floor
 * and roughly this height is in the band where a mirror duplicates enemies into
 * the sightline the player is actually searching.
 */
export const COMBAT_EYE_LINE_M = 1.75;

/**
 * Above this height a large flat vertical surface is out of the searching band
 * — a player is not scanning a third-storey window for an enemy silhouette at
 * torso height, and a mirror up there reads as architecture.
 */
export const ABOVE_COMBAT_BAND_M = 3.2;

/**
 * A surface this smooth returns a recognisable image rather than a blurred
 * suggestion. Below it (rougher), a reflection ray buys nothing the existing
 * environment probe does not already give, so it is not spawned at all — that
 * is the single biggest cost saving in the whole classifier.
 */
export const MIRROR_ROUGHNESS_CEILING = 0.22;

/** A surface with at least this metalness is a conductor. */
export const CONDUCTOR_METALNESS_FLOOR = 0.6;

/**
 * A surface whose normal is within this much of horizontal counts as a wall for
 * the eye-line rule. cos(20 degrees) ~= 0.94, so a normal with |y| below 0.34
 * is within 20 degrees of vertical-facing.
 */
export const WALL_NORMAL_Y_CEILING = 0.34;

/**
 * Large means "large enough that a duplicated enemy inside it is a real
 * mistake". A twentieth of the frame is roughly a doorway at engagement range.
 */
export const LARGE_SURFACE_SCREEN_FRACTION = 0.05;

export type SurfaceClassification = Readonly<{
  type: WhittedMaterialType;
  /** The single sentence that defends this assignment. */
  reason: string;
  /**
   * True when the classifier demoted a surface away from a more reflective
   * class for a readability reason rather than a cost reason. Counted and
   * asserted, so "beauty gave way" is measurable instead of aspirational.
   */
  readabilityDemotion: boolean;
}>;

/**
 * The rule table. Order matters: the readability demotions run BEFORE the
 * beauty assignments, because that is the direction the bound points.
 *
 * Each row's `reason` is the one sentence the skill's material section demands.
 * An assignment nobody can defend in one sentence is deleted, not kept.
 */
export function classifySurface(sample: SurfaceSample): SurfaceClassification {
  const roughness = Math.min(1, Math.max(0, sample.roughness));
  const metalness = Math.min(1, Math.max(0, sample.metalness));
  const facesSideways = Math.abs(sample.worldNormal[1]) <= WALL_NORMAL_Y_CEILING;
  const large = sample.screenAreaFraction >= LARGE_SURFACE_SCREEN_FRACTION;
  const inSearchBand = sample.heightM <= ABOVE_COMBAT_BAND_M;
  const smooth = roughness <= MIRROR_ROUGHNESS_CEILING;
  const conductor = metalness >= CONDUCTOR_METALNESS_FLOOR;

  // ---- Readability demotions, first and unconditionally. ------------------

  // A mirror wall doubles the enemy count: players shoot reflections and lose
  // the real target. No full-mirror Metal on a large flat vertical surface
  // inside the band a player searches for torsos.
  if (conductor && smooth && facesSideways && large && inSearchBand) {
    return Object.freeze({
      type: 'clearcoat' as const,
      reason: 'Large flat wall inside the combat search band: a mirror here duplicates enemies, so it keeps a Fresnel coat over a dark base instead.',
      readabilityDemotion: true,
    });
  }

  // A dark reflective floor eats the enemy's feet, and ground contact is where
  // players read range and stance. Floors never become mirrors; wet floors get
  // the coat, which is the look that was wanted anyway.
  if (!facesSideways && sample.worldNormal[1] > 0 && sample.heightM <= COMBAT_EYE_LINE_M && conductor && smooth) {
    return Object.freeze({
      type: 'clearcoat' as const,
      reason: 'Walkable floor: a mirror floor swallows the lower third of a silhouette, so the ground keeps a coat highlight and its contact contrast.',
      readabilityDemotion: true,
    });
  }

  // ---- Beauty assignments. ------------------------------------------------

  // Wet asphalt and standing water are dielectrics, and the coat is exactly the
  // material that makes them read as wet rather than as chrome.
  if (sample.wet && roughness <= 0.5) {
    return Object.freeze({
      type: 'clearcoat' as const,
      reason: 'Wet or standing-water surface: a dielectric coat over the dry base is what wet asphalt physically is.',
      readabilityDemotion: false,
    });
  }

  // Genuine transparent volumes. Deliberately narrow: only a surface the arena
  // itself flagged as smooth, non-metallic and small enough that it cannot be
  // mistaken for open air or for cover.
  if (!conductor && roughness <= 0.06 && sample.screenAreaFraction < LARGE_SURFACE_SCREEN_FRACTION) {
    return Object.freeze({
      type: 'transparent' as const,
      reason: 'Small, perfectly smooth dielectric — glass, a scope lens or a vial: it refracts and casts the caustic that makes the preset worth having.',
      readabilityDemotion: false,
    });
  }

  // The few surfaces the player is meant to look at: polished machinery, trim,
  // a weapon receiver. Small, smooth, conductive, and out of the wall band.
  if (conductor && smooth) {
    return Object.freeze({
      type: 'metal' as const,
      reason: 'Small polished conductor — trim, machinery or a receiver: a tinted mirror on a hero prop is what a metal surface is for.',
      readabilityDemotion: false,
    });
  }

  // The best beauty-per-cost material in the set, and the right answer whenever
  // the choice between Metal and ClearCoat is close.
  if (roughness <= 0.45) {
    return Object.freeze({
      type: 'clearcoat' as const,
      reason: 'Lacquered, plastic, ceramic or painted surface: the coat gives a moving highlight and a Fresnel rim without becoming a mirror.',
      readabilityDemotion: false,
    });
  }

  // The default for most of the world. A scene that is only Phong wastes the
  // renderer; a scene where thirty things are mirrors is less convincing than
  // one where three are, and it traces faster.
  return Object.freeze({
    type: 'phong' as const,
    reason: 'Terrain, concrete, brick, plaster, cloth, foliage or scuffed metal: diffuse plus a highlight, and no reflection ray at all.',
    readabilityDemotion: false,
  });
}

/** Builds the concrete material a classification implies. */
export function materialForClassification(
  classification: SurfaceClassification,
  albedo: Vec3,
  wet = false,
): WhittedMaterial {
  if (classification.type === 'metal') return metalMaterial(albedo);
  if (classification.type === 'clearcoat') return clearCoatMaterial(albedo);
  if (classification.type === 'transparent') {
    return transparentMaterial(
      albedo,
      wet ? WATER_INDEX_OF_REFRACTION : GLASS_INDEX_OF_REFRACTION,
    );
  }
  return phongMaterial(albedo);
}
