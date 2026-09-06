/**
 * nuketown-mountain-backdrop.ts — Pass 82 "surrounding mountains in nuketown".
 *
 * A distant procedural mountain ring OUTSIDE the boundary fence: beyond the
 * fence plane the horizon was empty sky, so the military-suburb read ended at
 * a picket fence floating in void. This module closes the world with:
 *
 *   - a ground skirt disc well BELOW the arena ground plane (y = -0.42), so
 *     the land visibly continues past the fence to the ridges instead of
 *     dropping into sky;
 *   - a low scrubland foothill ring; and
 *   - a taller main ridge ring behind it, both built as seeded low-poly
 *     triangle strips with per-segment crest/height variation (procedural
 *     ridgelines, not one repeated cone) and flat shading.
 *
 * ART-ONLY BY CONSTRUCTION (the whole point of the placement envelope):
 *   - every ridge vertex sits radially OUTSIDE the boundary fence corner
 *     (NUKETOWN_BACKDROP_MIN_RADIAL_M > |bounds corner| + fence), so no
 *     sightline test inside the arena can ever intersect it;
 *   - everything stays inside the arena camera's 180 m far plane from every
 *     reachable camera position (max radial + arena corner < 180);
 *   - no colliders, no raycast surfaces, no shadow passes.
 *
 * v4 2026-08-31 — "the mountains are inverted". Two measured causes, both
 * fixed here:
 *
 *   (a) THE VERTEX COLOURS WERE BEING DELETED AT RUNTIME. legacy-main's
 *       `batchPresentationRootOnce(neighbourhoodLifeRoot, 'palette-lit')`
 *       runs a SECOND static batch over the whole pass31 group long after
 *       this module has added itself to it. In 'palette-lit' mode
 *       art-kit.ts::batchStaticMeshes keys the batch on the material's
 *       `color` — 0xffffff for a vertexColors material — builds a fresh
 *       flat-white MeshLambertMaterial, and DELETES every attribute outside
 *       {position, normal}. The whole altitude/haze palette authored below
 *       was thrown away every single run and the massif was drawn as one
 *       merged, flat, pure-white Lambert batch. That is the paper-snowdrift
 *       look, and no amount of colour authoring could have survived it.
 *       Fix: `group.userData.dynamic = true`, the repo-standard opt-out that
 *       `batchStaticMeshes` honours (it is what rain-presentation and the
 *       flower beds already use). Costs 4 draws of a 560 budget.
 *   (b) THE RIDGE WAS FOGGED BRIGHTER THAN THE SKY. This arena's authored
 *       fog is 0xb1c0be (a pale grey-green, relative luminance 0.73) while
 *       its sunset sky measures 85-95/255 at the horizon. At the ridge's
 *       96-132 m the linear fog factor is 0.58-0.82, so runtime fog alone
 *       put a FLOOR under the ridge well above the sky behind it: even a
 *       black ridge could not read as a silhouette. Distant backdrops are
 *       painted, not lit and not fogged — so the three ridge rings now use
 *       an unlit MeshBasicMaterial with `fog = false` and carry their own
 *       baked terms: a directional shading term from the arena sun so the
 *       facets keep their form, and a radial haze term (kit-style, ported
 *       from environment-kit.ts::buildRidgeRing) that grades the far rows
 *       toward a dusk horizon colour. The snow lerp is GONE — a snowline
 *       that lerps crests 85% toward 0xdde4e6 is the single brightest thing
 *       that can be put on a horizon.
 *       The ground skirt keeps `fog = true` and stays lit: it is ground
 *       continuing out of the arena, and the arena's fog is correct for it.
 *
 * Original geometry only (repo sourcePolicy): every vertex is computed here
 * from closed-form sine octaves of the ring angle and phase — deterministic on every peer.
 */
import * as THREE from 'three';

/** Every ridge vertex is at least this far from the world origin (metres).
 * The boundary fence corner sits at hypot(31.3, 31.8) = 44.6 m; the envelope
 * starts well beyond it so the backdrop can never enter gameplay space. */
export const NUKETOWN_BACKDROP_MIN_RADIAL_M = 58;
/** Radial ceiling (metres): max radial + arena camera corner (44.3 m) stays
 * inside the atomic-acres 180 m camera far plane with margin. */
export const NUKETOWN_BACKDROP_MAX_RADIAL_M = 132;
/** Crest ceiling (metres). */
export const NUKETOWN_BACKDROP_MAX_HEIGHT_M = 34;
/** The ground skirt never rises above this (kept below the arena ground). */
export const NUKETOWN_BACKDROP_SKIRT_Y_M = -0.42;

/**
 * HF-426 Job 3 — the ring is now FITTED to a footprint instead of assuming one.
 *
 * The shipped map is a 62 x 64 m near-square, so one circular envelope suits it
 * on both axes. The Nuke Town Rebuild is 36 x 84 (bounds x +/-18, z +/-42,
 * corner 45.7 m), and dropping the shipped envelope on it would put the
 * foothill feet 18 m past the long fence while leaving 46 m of empty plain on
 * the short axis — the backdrop would read as a wall on one axis and as nothing
 * on the other. Both maps therefore declare their own envelope and every ring
 * radius below is derived from it, so a footprint change moves the massif.
 *
 * `skirt` is the second difference. The shipped map has no ground of its own
 * past the fence, so the backdrop brings a rolling disc. The rebuild's arena
 * authors a 270 x 270 m ground slab (`buildNuketown2`), which already runs 3 m
 * past this envelope's outer radius, so a second ground layer there would only
 * z-fight the first.
 */
export type NuketownBackdropEnvelope = Readonly<{
  /** Nothing in the massif comes closer to the origin than this. */
  minRadialM: number;
  /** ... and nothing goes beyond it (camera far plane 180 m minus the map corner). */
  maxRadialM: number;
  /** Crest ceiling. */
  maxHeightM: number;
  /** Build the rolling beyond-fence ground disc under the rings. */
  skirt: boolean;
}>;

/** The shipped map's envelope: exactly the constants above, unchanged. */
export const NUKETOWN_BACKDROP_ENVELOPE: NuketownBackdropEnvelope = Object.freeze({
  minRadialM: NUKETOWN_BACKDROP_MIN_RADIAL_M,
  maxRadialM: NUKETOWN_BACKDROP_MAX_RADIAL_M,
  maxHeightM: NUKETOWN_BACKDROP_MAX_HEIGHT_M,
  skirt: true,
});

/**
 * The rebuild's envelope. 66 m of clearance against a 45.7 m map corner is
 * 20 m past the long fence and 48 m past the short one — the same read the
 * shipped map gets from 58 against its own 44.6 m corner. The outer radius and
 * crest ceiling are unchanged: they are set by the 180 m camera far plane, not
 * by the map (132 + 45.7 = 177.7).
 */
export const NUKETOWN2_BACKDROP_ENVELOPE: NuketownBackdropEnvelope = Object.freeze({
  minRadialM: 66,
  maxRadialM: NUKETOWN_BACKDROP_MAX_RADIAL_M,
  maxHeightM: NUKETOWN_BACKDROP_MAX_HEIGHT_M,
  skirt: false,
});

/**
 * DAY-VISUAL-A (HF-535): layered haze per ring, nearest to farthest.
 *
 * The three ridge rings wash into HAZE_COLOR by these amounts (near, mid,
 * far). Order is the contract: a future refactor must keep
 * near < mid < far or the massif stops receding. Values unchanged from the
 * inline literals they replace (foothills 0.34, ridge 0.6, far range 0.82).
 */
export const NUKETOWN_MOUNTAIN_HAZE_NEAR = 0.34;
export const NUKETOWN_MOUNTAIN_HAZE_MID = 0.6;
export const NUKETOWN_MOUNTAIN_HAZE_FAR = 0.82;
/**
 * Warm low-sun haze band toward the sun, cool elsewhere (HF-535 day shift).
 *
 * HAZE_COLOR is the cool recession tone. HAZE_WARM_SUN is the same hue family
 * lifted toward the estate-golden-hour key (0xfff1ce): ridge faces on the sun
 * side wash into it, faces away wash into the cool tone. Kept below the
 * measured sunset-sky luminance so the far rows recede instead of glowing
 * (same constraint HAZE_COLOR documents).
 */
export const NUKETOWN_MOUNTAIN_HAZE_WARM_SUN = 0x8a7a5e;
/** How far the sun-side haze swings warm, 0..1. */
export const NUKETOWN_MOUNTAIN_HAZE_WARM_BAND = 0.55;
/**
 * Two-tone rock lighting (HF-535 day shift): warm sunlit faces, cool
 * blue-violet shadow faces, both multiplied over the altitude-banded rock.
 * Mid-grey bases so the product keeps the authored palette, not replaces it.
 */
export const NUKETOWN_MOUNTAIN_SUN_WARM = 0xffe0b8;
// DAY-POLISH (HF-535): deepened from 0x9aa0d0 so sunlit facets separate from
// shaded ravines at the overhead's distance; stays blue-violet, still a
// product tint over the authored palette.
export const NUKETOWN_MOUNTAIN_SHADE_COOL = 0x8f96c8;
/**
 * Contrast floor: fully-lit rock over fully-shaded rock, same base colour,
 * must read at least this different or the massif flattens to one cut-out.
 * The mountain test pins it.
 */
export const NUKETOWN_MOUNTAIN_TWO_TONE_FLOOR = 1.45;
/**
 * HF-536 Night Lane Gemini 3: Mountain strata bands and shadow fissures.
 * 1. STRATA: horizontal band function of world height, period 4-7m, width 25-35%, darkening 18-28%.
 * 2. FISSURES: 1-in-4 columns, darkening 35-45% on fissure, 12-18% on neighbours, down to 45-65% peak height.
 * 3. CONTRAST: crest p90/p10 >= 1.9, minimum vertex luma >= 10/255.
 */
export const NUKETOWN_MOUNTAIN_STRATA_PERIOD = 6.6;
export const NUKETOWN_MOUNTAIN_STRATA_WIDTH_FRACTION = 0.30;
export const NUKETOWN_MOUNTAIN_STRATA_DARKENING = 0.22;
export const NUKETOWN_MOUNTAIN_FISSURE_FRACTION = 0.25;
export const NUKETOWN_MOUNTAIN_FISSURE_DARKENING = 0.40;
export const NUKETOWN_MOUNTAIN_FISSURE_NEIGHBOUR_DARKENING = 0.15;
export const NUKETOWN_MOUNTAIN_FISSURE_HEIGHT_CUTOFF = 0.55;
export const NUKETOWN_MOUNTAIN_MIN_LUMA = 10.05 / 255.0;

/** Horizontal strata band darkening at world height y for a column with phase offset. */
export function nuketownMountainStrataDarkening(y: number, phase: number): number {
  const period = NUKETOWN_MOUNTAIN_STRATA_PERIOD;
  const width = period * NUKETOWN_MOUNTAIN_STRATA_WIDTH_FRACTION;
  const val = ((y - phase) % period + period) % period;
  return val < width ? NUKETOWN_MOUNTAIN_STRATA_DARKENING : 0;
}

/** Count of horizontal strata dark bands along a vertical column from ground up to peakHeight. */
export function countStrataBandsInColumn(peakHeight: number, phase: number): number {
  let count = 0;
  let inBand = false;
  const step = 0.05;
  for (let y = 0; y <= peakHeight; y += step) {
    const darkening = nuketownMountainStrataDarkening(y, phase);
    const active = darkening > 0;
    if (active && !inBand) {
      count += 1;
      inBand = true;
    } else if (!active && inBand) {
      inBand = false;
    }
  }
  return count;
}
/**
 * Apply the two-tone rock light to a base colour.
 *
 * Pure (no THREE renderer needed) so the contract test can pin the contrast
 * floor directly: `lambert` 0 = full shade, 1 = full sun.
 */
export function mountainTwoTone(
  baseR: number,
  baseG: number,
  baseB: number,
  lambert: number,
  out: [number, number, number],
): [number, number, number] {
  const t = Math.min(1, Math.max(0, lambert));
  // sRGB mixes read better here than linear: the shift is a surface tint,
  // not a light transport term. Derived from the exported swing constants so
  // a palette pass moves the rock with them (DAY-POLISH HF-535).
  const sunR = ((NUKETOWN_MOUNTAIN_SUN_WARM >> 16) & 255) / 255;
  const sunG = ((NUKETOWN_MOUNTAIN_SUN_WARM >> 8) & 255) / 255;
  const sunB = (NUKETOWN_MOUNTAIN_SUN_WARM & 255) / 255;
  const shadeR = ((NUKETOWN_MOUNTAIN_SHADE_COOL >> 16) & 255) / 255;
  const shadeG = ((NUKETOWN_MOUNTAIN_SHADE_COOL >> 8) & 255) / 255;
  const shadeB = (NUKETOWN_MOUNTAIN_SHADE_COOL & 255) / 255;
  out[0] = baseR * (shadeR + (sunR - shadeR) * t);
  out[1] = baseG * (shadeG + (sunG - shadeG) * t);
  out[2] = baseB * (shadeB + (sunB - shadeB) * t);
  return out;
}

/**
 * Atmospheric-perspective haze, derived FROM the arena's fog colour 0xb1c0be
 * (nuketown2-lighting/presets.ts, fog 58..148 m) rather than picked freehand.
 * Raw fog colour cannot be used directly: v4 measured it at relative
 * luminance 0.73 against a sunset sky of 85-95/255, so hazing toward it put
 * a floor under the ridge ABOVE the sky (ridge/sky 2.15 in the worst band).
 * This keeps the fog hue and scales it by 0.45 (0xb1c0be -> 0x505656), which
 * sits below the measured sky luminance so the far rows recede instead of
 * glowing. Distance fog tuning is untouched (RIDGE_FOG stays false, the
 * skirt stays scene-fogged): the perspective term is baked per vertex below.
 */
const HAZE_COLOR = new THREE.Color(0x505656);
/** Direction the arena's key light comes FROM (atomic-acres sun at -48/42/30). */
const SUN_DIRECTION = new THREE.Vector3(-48, 42, 30).normalize();
/** Measurement switch — see the v4 note in the file header. */
const RIDGE_FOG = false;

export interface NuketownBackdropStats {
  meshes: number;
  triangles: number;
}

export interface NuketownMountainBackdrop {
  group: THREE.Group;
  stats: Readonly<NuketownBackdropStats>;
  dispose(): void;
}

/**
 * Smooth per-angle variation, v5. Integer sine frequencies are 2π-periodic,
 * so the ring closes exactly at segment === segments with no seam and no
 * per-segment discontinuity. This replaces the v2 hash jitter, whose
 * per-segment steps were the faceting the reference critic read as separate
 * plates (one flat tone and one straight crest run per segment). Same range
 * as the old jitter, none of its edges. Deterministic: pure function of
 * angle and the ring's own phase.
 */
function smoothVar(angle: number, baseFreq: number, phase: number): number {
  return 0.5 * Math.sin(angle * baseFreq + phase)
    + 0.3 * Math.sin(angle * (2 * baseFreq + 1) + phase * 1.7)
    + 0.2 * Math.sin(angle * (3 * baseFreq + 2) + phase * 2.3);
}

type RidgeRingSpec = Readonly<{
  name: string;
  segments: number;
  /** Radial band [innerBase, outerBase]; the crest wanders inside it. */
  innerRadius: number;
  outerRadius: number;
  /** Crest height band [min, max] before the per-segment variation. */
  heightMin: number;
  heightMax: number;
  /** Base colour at the foot and near the crest (vertex-colour lerp). */
  footColor: number;
  crestColor: number;
  /** Decorrelates the sine octaves between rings. */
  phase: number;
  /**
   * How far this ring's far side washes into HAZE_COLOR, 0..1. Ported from
   * environment-kit.ts::buildRidgeRing.
   */
  haze: number;
  /** Direct haze mix toward HAZE_COLOR across the ring (aerial perspective). */
  aerialHazeMix?: number;
  /** Baked sun term: 0 = flat paint, 1 = full swing between lit and shaded. */
  shadeStrength: number;
  /** Jitter column normals by +-0.25 rad for facet alternation. */
  facetJitter?: boolean;
  /** Horizontal strata bands (world height banding). */
  strata?: boolean;
  /** Vertical shadow fissures on crest columns. */
  fissures?: boolean;
}>;

/**
 * One ridge ring, v2 (owner 2026-08-29: "mountains should be implemented
 * using the techniques I am sharing"). Five vertex rows per angular segment
 * (inner foot, inner shoulder, crest, outer shoulder, outer foot) displaced
 * by RIDGED octave noise - 1-|sin| octaves sharpen the crestline into peaks
 * and saddles the way ridged FBM does, instead of the old three-row tent
 * profile that read as one soft lump from every angle. Colour is banded by
 * altitude (dry scrub foot, sage rock mid-slope, pale granite crest) with
 * smooth tonal variation, and the shoulders wander off the crest line so
 * spurs run down the slopes. Deterministic: pure function of angle and phase.
 * v5: the per-segment hash jitter is gone (it faceted the silhouette into one
 * flat plate per segment); segment density rises only on the two far rings
 * whose crests form the visible silhouette (see buildNuketownMountainBackdrop).
 */
function buildRidgeRing(spec: RidgeRingSpec): THREE.BufferGeometry {
  const positions: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];
  const foot = new THREE.Color(spec.footColor);
  const mid = new THREE.Color(spec.footColor).lerp(new THREE.Color(spec.crestColor), 0.55);
  const crest = new THREE.Color(spec.crestColor);
  const vertexColor = new THREE.Color();
  const hazeWarm = new THREE.Color(NUKETOWN_MOUNTAIN_HAZE_WARM_SUN);
  const hazeTarget = new THREE.Color();
  const toneRgb: [number, number, number] = [0, 0, 0];
  // Sun azimuth in ring-angle convention (x = cos, z = sin): the haze band
  // and the two-tone both key off it, so the warm side is the sun side.
  const sunAzimuth = Math.atan2(SUN_DIRECTION.z, SUN_DIRECTION.x);

  // Ridged octave: 1-|sin| gives sharp peaks at the sine zero crossings.
  const ridged = (angle: number, phase: number): number => {
    const o1 = 1 - Math.abs(Math.sin(angle * 3 + phase));
    const o2 = 1 - Math.abs(Math.sin(angle * 7 + phase * 2.3));
    const o3 = 1 - Math.abs(Math.sin(angle * 13 + phase * 4.1));
    const o4 = 1 - Math.abs(Math.sin(angle * 23 + phase * 7.9));
    return (o1 * 0.35 + o2 * 0.30 + o3 * 0.22 + o4 * 0.13);
  };

  const rows = 5;
  for (let segment = 0; segment <= spec.segments; segment += 1) {
    const wrapped = segment % spec.segments;
    const angle = (wrapped / spec.segments) * Math.PI * 2;
    const isFissureCol = spec.fissures && (wrapped % 4 === 1);
    const isNeighbourCol = spec.fissures && (
      ((wrapped + 1) % 4 === 1) || ((wrapped - 1 + spec.segments) % 4 === 1)
    );
    // v5: smooth variation, continuous in angle (see smoothVar). The old
    // hash jitter stepped every segment, faceting both the silhouette and
    // the tone into one flat plate per segment.
    const varA = smoothVar(angle, 3, spec.phase) * 0.5 + 0.5;
    const varB = smoothVar(angle, 2, spec.phase * 0.7) * 0.5 + 0.5;
    const varC = smoothVar(angle, 4, spec.phase + 1.1) * 0.5 + 0.5;

    const relief = ridged(angle, spec.phase);
    const rSharp = Math.pow(relief, 1.4);
    const heightT = Math.min(1, Math.max(0.04, rSharp * 1.25 + (varA - 0.5) * 0.2));
    const height = spec.heightMin + (spec.heightMax - spec.heightMin) * heightT;
    const band = spec.outerRadius - spec.innerRadius;
    const crestRadius = spec.innerRadius
      + band * (0.36 + 0.26 * ridged(angle * 0.5 + 1.3, spec.phase * 1.7) + (varB - 0.5) * 0.16);
    // Spur wander: shoulders leave the crest line so ridgelines run DOWN the
    // slopes instead of the slope being one straight cone face. Smooth like
    // the rest: the old per-segment spur steps read as kinks from the street.
    const spurIn = (varC - 0.5) * band * 0.18;
    const spurOut = (0.5 - varC) * band * 0.14;
    const innerShoulderY = height * (0.4 + 0.18 * ridged(angle * 2.1, spec.phase + 2.2));
    const outerShoulderY = height * (0.5 + 0.16 * ridged(angle * 1.7, spec.phase + 4.4));
    const innerShoulderR = Math.min(crestRadius,
      Math.max(spec.innerRadius, spec.innerRadius + (crestRadius - spec.innerRadius) * 0.55 + spurIn));
    const outerShoulderR = crestRadius + (spec.outerRadius - crestRadius) * 0.5 + spurOut;

    const ringRows: Array<readonly [number, number, number]> = [
      [spec.innerRadius, -0.2, 0],
      [Math.max(spec.innerRadius, innerShoulderR), innerShoulderY, 0.45],
      [crestRadius, height, 1],
      [Math.min(spec.outerRadius, outerShoulderR), outerShoulderY, 0.5],
      [spec.outerRadius, -2.5, 0],
    ];
    for (let row = 0; row < rows; row += 1) {
      const [radius, y, altitude] = ringRows[row];
      positions.push(Math.cos(angle) * radius, y, Math.sin(angle) * radius);
      // Altitude banding: scrub foot -> sage rock -> cool crest. The crest
      // row stays in the rock band even at saddles so facets read two-tone.
      const altFactor = Math.min(1, height / spec.heightMax);
      const t = altitude === 1 ? 0.65 + 0.35 * altFactor : altitude * altFactor;
      if (t < 0.5) vertexColor.copy(foot).lerp(mid, t * 2);
      else vertexColor.copy(mid).lerp(crest, (t - 0.5) * 2);
      // v4: NO snow lerp. The old snowline pulled crests 85% toward 0xdde4e6,
      // which is brighter than this arena's entire sky.
      //
      // Radial haze (kit port): the further out the vertex, the more it washes
      // into the dusk horizon. `smoothstep` over the ring's own radial band
      // keeps the near foot crisp and the far rim soft, exactly as
      // environment-kit's ridge does across its band parameter.
      const radialT = THREE.MathUtils.clamp(
        (radius - spec.innerRadius) / Math.max(1e-3, spec.outerRadius - spec.innerRadius), 0, 1,
      );
      // DAY-VISUAL-A (HF-535): the haze target swings warm on the sun side.
      // `facing` is cos(angle - sunAzimuth): 1 toward the sun, -1 away.
      const facing = Math.cos(angle - sunAzimuth);
      hazeTarget.copy(HAZE_COLOR).lerp(
        hazeWarm, NUKETOWN_MOUNTAIN_HAZE_WARM_BAND * (0.5 + 0.5 * facing),
      );
      if (spec.aerialHazeMix !== undefined) {
        vertexColor.lerp(hazeTarget, spec.aerialHazeMix);
      } else {
        const hazeFactor = (spec.facetJitter && row === 2)
          ? 0.05
          : spec.haze * THREE.MathUtils.smoothstep(radialT, 0.05, 0.95);
        vertexColor.lerp(hazeTarget, hazeFactor);
      }
      // massif reads as one flat cut-out. Slope normal is approximated from
      // the row's rise over its radial run, which is all a ridge silhouette
      // needs and costs nothing at runtime.
      const rise = row === 0 ? 0 : ringRows[row][1] - ringRows[row - 1][1];
      const run = row === 0 ? 1 : Math.max(1e-3, ringRows[row][0] - ringRows[row - 1][0]);
      const slope = Math.atan2(rise, run);
      const slopeFacing = Math.cos(angle) * SUN_DIRECTION.x + Math.sin(angle) * SUN_DIRECTION.z;
      const baseDot = Math.cos(slope) * SUN_DIRECTION.y - Math.sin(slope) * slopeFacing;

      let lambert: number;
      let normalJitter = 0;
      if (spec.facetJitter) {
        normalJitter = (segment % 2 === 0 ? 0.25 : -0.25);
        // Jitter drives adjacent facets between lit (warm R > B >= 15) and shade (cool B > R >= 10)
        lambert = THREE.MathUtils.clamp(0.5 + normalJitter * 3.5 + baseDot * 0.08, 0, 1);
      } else {
        lambert = THREE.MathUtils.clamp(0.5 + 0.5 * baseDot, 0, 1);
      }
      const litT = 1 - spec.shadeStrength + spec.shadeStrength * lambert;
      mountainTwoTone(vertexColor.r, vertexColor.g, vertexColor.b, litT, toneRgb);

      let r = toneRgb[0];
      let g = toneRgb[1];
      let b = toneRgb[2];

      // HF-536 Night Lane Gemini 3:
      // 1. Facet contrast boost on jittered ridge facets (raise lit/shade p90/p10 ratio >= 1.9)
      if (spec.facetJitter) {
        if (normalJitter > 0) {
          // Warm sunlit facet boost
          r *= 1.25;
          g *= 1.20;
          b *= 1.15;
        } else {
          // Cool shade facet: deepen shade while enhancing cool blue-violet tint
          r *= 0.82;
          g *= 0.88;
          b *= 1.05;
        }
      }

      // 2. Horizontal strata bands: darken vertex color by 22% (18-28%) inside band
      if (spec.strata) {
        const colPhase = 3.8 + smoothVar(angle, 4, spec.phase + 2.5) * 0.4;
        const strataDarkening = nuketownMountainStrataDarkening(y, colPhase);
        if (strataDarkening > 0) {
          const factor = 1 - strataDarkening;
          r *= factor;
          g *= factor;
          b *= factor;
        }
      }

      // 3. Vertical shadow fissures: from crest down to 55% (45-65%) of peak height
      if (spec.fissures) {
        const cutoffY = height * NUKETOWN_MOUNTAIN_FISSURE_HEIGHT_CUTOFF;
        if (y >= cutoffY) {
          const fissureT = (y - cutoffY) / Math.max(1e-3, height - cutoffY);
          if (isFissureCol) {
            const d = NUKETOWN_MOUNTAIN_FISSURE_DARKENING * fissureT;
            r *= (1 - d);
            g *= (1 - d);
            b *= (1 - d * 0.95);
          } else if (isNeighbourCol) {
            const d = NUKETOWN_MOUNTAIN_FISSURE_NEIGHBOUR_DARKENING * fissureT;
            r *= (1 - d);
            g *= (1 - d);
            b *= (1 - d);
          }
        }
      }

      const tone = 0.94 + varA * 0.12;
      r *= tone;
      g *= tone;
      b *= tone;

      // 4. Shadow floor: keep every vertex luma >= 10/255 in linear units (no exact-black rock)
      const vertexLuma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      if (vertexLuma < NUKETOWN_MOUNTAIN_MIN_LUMA) {
        const lift = NUKETOWN_MOUNTAIN_MIN_LUMA / Math.max(1e-4, vertexLuma);
        r *= lift;
        g *= lift;
        b *= lift;
      }

      colors.push(r, g, b);
    }
  }

  for (let segment = 0; segment < spec.segments; segment += 1) {
    const a = segment * rows;
    const b = (segment + 1) * rows;
    for (let row = 0; row < rows - 1; row += 1) {
      indices.push(a + row, b + row, a + row + 1);
      indices.push(a + row + 1, b + row, b + row + 1);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.name = spec.name;
  return geometry;
}

/**
 * Height of the beyond-fence ground at (x, z), metres.
 *
 * v4 2026-08-31 — "the forest stands on a plate". The skirt used to be a flat
 * CircleGeometry at a constant y and every one of the 769 forest instances was
 * planted at that same constant, so 769 trees met the ground on a razor edge
 * with no contact anywhere. This is the ground the forest now queries (see
 * nuketown-forest-surround.ts): gentle seeded swells with a shallow rise
 * toward the foothills.
 *
 * CONTRACT: the return value is always <= NUKETOWN_BACKDROP_SKIRT_Y_M, i.e.
 * this ground can dip below the arena floor but never rise through it. The
 * skirt-containment test depends on that and so does the "no lip at the fence"
 * read, so the clamp is not a safety net, it is the definition.
 */
export function nuketownBackdropGroundY(x: number, z: number): number {
  const radial = Math.hypot(x, z);
  // Long swells (two decorrelated sine pairs) plus a shorter chop: enough
  // relief to break the plate, far too little to read as cover or terrain.
  const swell =
    Math.sin(x * 0.041 + 1.7) * Math.cos(z * 0.037 - 0.6) * 0.95 +
    Math.sin(x * 0.093 - 2.3) * Math.cos(z * 0.081 + 1.1) * 0.42 +
    Math.sin((x + z) * 0.171 + 0.4) * 0.18;
  // Beyond the forest band the ground lifts toward the foothill feet so the
  // massif grows out of the land instead of being parked on it.
  const lift = THREE.MathUtils.smoothstep(radial, 52, 74) * 1.35;
  return Math.min(NUKETOWN_BACKDROP_SKIRT_Y_M, NUKETOWN_BACKDROP_SKIRT_Y_M - 1.15 + swell * 0.62 + lift);
}

/** Ground normal at (x, z), central-differenced from the height field. */
export function nuketownBackdropGroundNormal(x: number, z: number, target = new THREE.Vector3()): THREE.Vector3 {
  const step = 1.6;
  const dx = nuketownBackdropGroundY(x + step, z) - nuketownBackdropGroundY(x - step, z);
  const dz = nuketownBackdropGroundY(x, z + step) - nuketownBackdropGroundY(x, z - step);
  return target.set(-dx, 2 * step, -dz).normalize();
}

/** The rolling beyond-fence ground disc, vertex-coloured scrub to forest floor. */
function buildGroundSkirt(outerRadius: number): THREE.BufferGeometry {
  // A ring grid, not a triangle fan: CircleGeometry has no interior vertices,
  // so it cannot carry a height field at all.
  const geometry = new THREE.RingGeometry(0.5, outerRadius, 72, 16);
  geometry.rotateX(-Math.PI / 2);
  const positions = geometry.getAttribute('position');
  const colors = new Float32Array(positions.count * 3);
  const near = new THREE.Color(0x4c5340); // damp forest floor under the trees
  const far = new THREE.Color(0x5d6047); // dry scrub running up to the foothills
  const scratch = new THREE.Color();
  for (let index = 0; index < positions.count; index += 1) {
    const x = positions.getX(index);
    const z = positions.getZ(index);
    positions.setY(index, nuketownBackdropGroundY(x, z) - NUKETOWN_BACKDROP_SKIRT_Y_M);
    const radial = Math.hypot(x, z);
    scratch.copy(near).lerp(far, THREE.MathUtils.clamp((radial - 34) / 40, 0, 1));
    const mottle = 0.9 + 0.2 * (0.5 + 0.5 * Math.sin(x * 0.37 + 2.1) * Math.cos(z * 0.29 - 1.3));
    colors[index * 3] = scratch.r * mottle;
    colors[index * 3 + 1] = scratch.g * mottle;
    colors[index * 3 + 2] = scratch.b * mottle;
  }
  positions.needsUpdate = true;
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  geometry.name = 'nuketown-backdrop-ground-skirt';
  return geometry;
}

/**
 * Build the backdrop under `parent`. Deterministic; art-only. Returns stats
 * for telemetry/tests. Four meshes = four draws.
 */
export function buildNuketownMountainBackdrop(
  parent: THREE.Object3D,
  envelope: NuketownBackdropEnvelope = NUKETOWN_BACKDROP_ENVELOPE,
): NuketownMountainBackdrop {
  // Ring radii as OFFSETS from the envelope's inner edge, so the shipped map's
  // authored 64 / 92 / 96 / 132 / 116 fall out of `minRadialM = 58` unchanged
  // and any other footprint gets the same massif, fitted.
  const foothillsInner = envelope.minRadialM + 6;
  const foothillsOuter = envelope.minRadialM + 34;
  const ridgeInner = envelope.minRadialM + 38;
  const farRangeInner = envelope.minRadialM + 58;
  const group = new THREE.Group();
  group.name = 'nuketown-mountain-backdrop';
  group.userData.presentationOnly = true;
  group.userData.blocksShots = false;
  group.userData.nuketownBackdrop = true;
  // THE fix for the paper-snowdrift ridge - see cause (a) in the file header.
  // legacy-main re-batches the whole pass31 group in 'palette-lit' mode, which
  // deletes the `color` attribute and replaces the material with flat white.
  // `dynamic` is art-kit.ts::batchStaticMeshes's documented opt-out.
  group.userData.dynamic = true;

  // Unlit ridge rings. A distant backdrop is painted, not lit: the sun term
  // and the haze term are baked per vertex above, so nothing here needs a
  // lighting pass, a shadow pass, or the arena's fog (which is keyed 0xb1c0be,
  // brighter than this arena's sky, and was putting a floor under the ridge
  // well above the sky behind it - measured ridge/sky 2.15 in the worst band).
  const ridgeMaterial = new THREE.MeshBasicMaterial({
    vertexColors: true,
    fog: RIDGE_FOG,
  });
  ridgeMaterial.name = 'nuketown-ridge-painted';
  // The skirt is different in kind: it is GROUND continuing out of the arena,
  // at arena distances, so it stays lit and stays fogged.
  const skirtMaterial = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 1,
    metalness: 0,
  });

  // Scrubby foothill band: low, close enough to be readable over the fence.
  const foothills = new THREE.Mesh(
    buildRidgeRing({
      name: 'nuketown-mountain-foothills',
      segments: 108,
      innerRadius: foothillsInner,
      outerRadius: foothillsOuter,
      heightMin: 4,
      heightMax: 12,
      footColor: 0x222a20,
      crestColor: 0x2c3426,
      phase: 1.9,
      haze: NUKETOWN_MOUNTAIN_HAZE_NEAR,
      shadeStrength: 0.68,
    }),
    ridgeMaterial,
  );
  // Main ridge: taller, further, mostly fog-graded silhouette.
  const ridge = new THREE.Mesh(
    buildRidgeRing({
      name: 'nuketown-mountain-ridge',
      segments: 200,
      innerRadius: ridgeInner,
      outerRadius: envelope.maxRadialM,
      heightMin: 10,
      heightMax: envelope.maxHeightM - 2,
      footColor: 0x78787e,
      crestColor: 0xa2a2a8,
      phase: 4.7,
      haze: NUKETOWN_MOUNTAIN_HAZE_MID,
      shadeStrength: 0.95,
      facetJitter: true,
      strata: true,
      fissures: true,
    }),
    ridgeMaterial,
  );
  const farRange = new THREE.Mesh(
    buildRidgeRing({
      name: 'nuketown-mountain-far-range',
      segments: 152,
      innerRadius: farRangeInner,
      outerRadius: envelope.maxRadialM,
      heightMin: 20,
      heightMax: envelope.maxHeightM,
      footColor: 0xd0d8e4,
      crestColor: 0xe4ecfa,
      phase: 8.3,
      haze: NUKETOWN_MOUNTAIN_HAZE_FAR,
      aerialHazeMix: 0.52,
      shadeStrength: 0.36,
    }),
    ridgeMaterial,
  );
  // The skirt is the arena's beyond-fence GROUND. An arena that authors its own
  // ground out to this envelope declares `skirt: false` and takes the rings
  // alone, rather than laying a second ground layer on top of the first.
  const skirt = envelope.skirt
    ? new THREE.Mesh(buildGroundSkirt(envelope.maxRadialM), skirtMaterial)
    : null;
  if (skirt) {
    skirt.name = 'nuketown-backdrop-ground-skirt';
    skirt.position.y = NUKETOWN_BACKDROP_SKIRT_Y_M;
  }

  let triangles = 0;
  const meshes: THREE.Mesh[] = skirt ? [skirt, foothills, ridge, farRange] : [foothills, ridge, farRange];
  for (const mesh of meshes) {
    if (mesh !== skirt) mesh.name = mesh.geometry.name;
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    mesh.userData.presentationOnly = true;
    mesh.userData.blocksShots = false;
    mesh.userData.nuketownBackdrop = true;
    const index = mesh.geometry.index;
    triangles += index ? index.count / 3 : (mesh.geometry.getAttribute('position')?.count ?? 0) / 3;
    group.add(mesh);
  }

  parent.add(group);
  const stats: NuketownBackdropStats = { meshes: meshes.length, triangles: Math.round(triangles) };
  return {
    group,
    stats,
    dispose: () => {
      foothills.geometry.dispose();
      ridge.geometry.dispose();
      farRange.geometry.dispose();
      skirt?.geometry.dispose();
      ridgeMaterial.dispose();
      skirtMaterial.dispose();
    },
  };
}
