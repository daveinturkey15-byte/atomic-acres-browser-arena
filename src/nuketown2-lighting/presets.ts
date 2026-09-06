/**
 * nuketown2-lighting/presets.ts — the Nuke Town Rebuild's OWN sun/sky rig.
 *
 * WHY THIS EXISTS. `src/rendering/lighting-conditions.ts` is the game-wide
 * time-of-day model, and its roster row for this arena is PINNED with an
 * explicit note that the arena's own lane fills it in. This is that lane. It
 * does not widen the generic band (widening a band means re-running
 * `scripts/qa/scan-lane-ab-band-readability.mjs`, which this lane has not run);
 * it authors THREE named skies for this one arena and resolves between them
 * with the same arithmetic, the same bounds and the same fail-closed sweep the
 * generic model uses.
 *
 * THE FROZEN LIGHT SET RULE (PASS 82) IS NOT NEGOTIABLE HERE EITHER. Three's
 * WebGPU light set is part of every material's cache key: adding, removing or
 * toggling a light at runtime invalidates every pipeline and freezes the game.
 * So NOTHING in this directory returns a light, a material, a node or a
 * texture. Every field below is a NUMBER that a caller writes into a light, a
 * fog or an exposure that already exists. `writes.ts` emits exactly the shipped
 * `LightingConditionWrites` record and nothing else, which is why this lane
 * adds no pipeline and therefore needs no menu-time precompile entry —
 * `no-new-pipeline.test.ts` pins that as a property of the source rather than
 * as a claim in a comment.
 *
 * THE ANCHOR IS GOLDEN HOUR, AND IT IS BIT-IDENTICAL. The shipped
 * `src/rendering/arenas/nuketown2.ts` authors sun 0xfff1ce at 3.2, ambient
 * 0x8fb0bf at 0.42, fog 0xb1c0be 58..148, exposure 1.08, sky
 * 'estate-golden-hour'. That IS `golden-hour` below, and its resolved writes
 * are the exact identity, so a build that selects it renders the PASS 93 look
 * to the bit. The other two skies are bounded excursions away from a known-good
 * frame, never a replacement for it.
 *
 * EXPOSURE IS DERIVED, NOT FELT. Each preset carries the horizontal illuminance
 * a real sky of that description delivers (CIE standard clear-sky and
 * 8/8-stratus values). EV100 = log2(E / 2.5) — incident metering, C = 250, ISO
 * 100 — and a camera that re-meters returns middle grey to the same place, so
 * the PHYSICAL exposure ratio against the anchor is 2^(EV_anchor - EV_p). That
 * number is recorded per preset and is what the applied exposure is bounded BY:
 * the applied scale is never above the physical re-meter and never above the
 * shipped `LIGHTING_CONDITION_BOUNDS.exposureScale` envelope.
 *
 * THE COMPETITIVE-FPS CLAMP, STATED AS A NUMBER. A prettier sky must never be a
 * place to hide. The floor is the arena's own AUTHORED composed shade response
 * — authored ambient intensity x authored exposure, 0.42 x 1.08 = 0.4536 — and
 * every preset, in every weather, must compose a shade response at or above it.
 * That is `NUKETOWN2_SHADE_READABILITY_FLOOR`, it is swept at import time by
 * `assertNuketown2LightingSafety()` in `writes.ts`, and it is the reason the
 * physical exposure ratio for `late-morning` (0.199 — a real camera stopping
 * down 2.3 stops at noon) is NOT applied: stopping down is exactly the move
 * that puts a defender into an unreadable shadow, so the brightness difference
 * is carried by the key, the sky tint and the shadow LENGTH instead.
 */

import { LIGHTING_CONDITION_BOUNDS, type Rgb3 } from '../rendering/lighting-conditions';
import {
  BAKED_INDIRECT_MAXIMUM_GAIN,
  resolveBakedIndirectTuning,
  type BakedIndirectTier,
} from '../rendering/lighting/baked-indirect';
import {
  DISPLAY_VIGNETTE_MAXIMUM,
  MAXIMUM_COMPOSED_MIDTONE_CONTRAST,
  MINIMUM_COMPOSED_BLOOM_THRESHOLD,
} from '../rendering/art-direction';
import { GODRAY_MAXIMUM_ADDITIVE_GAIN } from '../rendering/screen-space-post-profile';

/** The three authored skies. Ordered light-to-warm; the order is the menu's. */
export type Nuketown2SkyPresetId = 'late-morning' | 'golden-hour' | 'overcast';

export const NUKETOWN2_SKY_PRESET_IDS: readonly Nuketown2SkyPresetId[] = Object.freeze([
  'late-morning', 'golden-hour', 'overcast',
]);

/** Player-facing labels, matching the shipped time-of-day row's voice. */
export const NUKETOWN2_SKY_PRESET_LABELS: Readonly<Record<Nuketown2SkyPresetId, string>> = Object.freeze({
  'late-morning': 'LATE MORNING',
  'golden-hour': 'GOLDEN HOUR',
  overcast: 'OVERCAST',
});

/** The preset the arena's shipped definition already authors. Identity anchor. */
export const NUKETOWN2_ANCHOR_PRESET: Nuketown2SkyPresetId = 'golden-hour';

/**
 * The arena's authored anchor values, mirrored from
 * `src/rendering/arenas/nuketown2.ts`. `presets.test.ts` pins them against that
 * definition, so the mirror cannot drift into a lie.
 */
export const NUKETOWN2_AUTHORED = Object.freeze({
  sunColor: 0xfff1ce,
  sunIntensity: 3.2,
  ambientColor: 0x8fb0bf,
  ambientIntensity: 0.42,
  fogColor: 0xb1c0be,
  fogNear: 58,
  fogFar: 148,
  exposure: 1.08,
  skyPreset: 'nuketown2-golden-hour',
});

/**
 * The longest in-bounds sightline on this arena, from the definition header:
 * the 36 x 84 m playspace's diagonal. Every preset's fog curve is judged at
 * this distance rather than at an authored near/far pair, because near/far are
 * meaningless without the run they are seen over.
 */
export const NUKETOWN2_LONGEST_SIGHTLINE_M = 91.4;

/**
 * Aerial perspective at the longest run must stay inside this window. Below the
 * floor the map is airless and flat; above the ceiling a player at the far end
 * of the street is haze rather than a target. The anchor sits at 0.371, which
 * is where the shipped definition's own header says it sits.
 */
export const NUKETOWN2_LONGEST_RUN_HAZE_BOUNDS = Object.freeze({ minimum: 0.12, maximum: 0.48 });

/**
 * THE COMPETITIVE-FPS CLAMP. Authored ambient intensity x authored exposure.
 * Composed shade response may rise above this at any time; it may never fall
 * below it, in any preset, at any weather rung.
 */
export const NUKETOWN2_SHADE_READABILITY_FLOOR
  = NUKETOWN2_AUTHORED.ambientIntensity * NUKETOWN2_AUTHORED.exposure;

/** Incident-metering constant: EV100 = log2(lux / 2.5) at C = 250, ISO 100. */
export const INCIDENT_METER_CONSTANT = 2.5;

/** Rec.709 luma weights, used to reduce a tint to one readability number. */
const LUMA: readonly [number, number, number] = Object.freeze([0.2126, 0.7152, 0.0722] as const);

export function tintLuma(tint: Rgb3): number {
  return tint[0] * LUMA[0] + tint[1] * LUMA[1] + tint[2] * LUMA[2];
}

export function ev100FromLux(lux: number): number {
  return Math.log2(Math.max(lux, 1e-6) / INCIDENT_METER_CONSTANT);
}

export type Nuketown2SkyPreset = Readonly<{
  id: Nuketown2SkyPresetId;
  /** One line of author intent; what this sky must say in the first second. */
  brief: string;
  /**
   * The capture hour this preset is addressed by. Deterministic captures and
   * `?tod=` pass a `fixedHour`, and the resolver snaps it to the nearest of
   * these. `overcast` is named by the hour of its slot, not by a sun position:
   * an 8/8 stratus deck has no golden hour and no noon.
   */
  captureHour: number;
  /** Sun elevation above the horizon, degrees. Inside the shipped envelope. */
  sunElevationDegrees: number;
  /** Sun bearing relative to the anchor's, degrees. */
  sunAzimuthDeltaDegrees: number;
  /**
   * Horizontal illuminance from the DIRECT sun, lux. Zero under stratus, which
   * is the whole difference between `overcast` and a dim clear sky.
   */
  directIlluminanceLux: number;
  /** Horizontal illuminance from the SKY DOME, lux. This is what lights shade. */
  skyIlluminanceLux: number;
  /**
   * Extinction of the direct beam by cloud, 0..1. Multiplies the geometric
   * cosine law, so `overcast` loses its key without moving the sun.
   */
  cloudExtinction: number;
  /** Key colour multiplier over the authored sun colour. */
  sunTint: Rgb3;
  /** Sky-dome colour multiplier over authored ambient/hemisphere/fill. */
  skyTint: Rgb3;
  /** Fog colour multiplier over the authored fog colour. */
  fogTint: Rgb3;
  /** Authored fog span for this sky, in metres. */
  fogNear: number;
  fogFar: number;
  /** Emissive gain on the interior practical fixtures. Value composition. */
  practicalEmissiveGain: number;
  /** Baked-indirect defaults this arena wants under this sky. */
  bakedIndirect: Readonly<{ preferredTier: BakedIndirectTier; compositeScale: number }>;
  /** Filmic post, expressed as scales over the arena's art-direction row. */
  filmic: Readonly<{
    bloomThresholdScale: number;
    vignetteScale: number;
    godrayAdditiveGain: number;
    midtoneContrastDelta: number;
  }>;
}>;

const preset = (value: Nuketown2SkyPreset): Nuketown2SkyPreset => Object.freeze({
  ...value,
  sunTint: Object.freeze([value.sunTint[0], value.sunTint[1], value.sunTint[2]] as const),
  skyTint: Object.freeze([value.skyTint[0], value.skyTint[1], value.skyTint[2]] as const),
  fogTint: Object.freeze([value.fogTint[0], value.fogTint[1], value.fogTint[2]] as const),
  bakedIndirect: Object.freeze({ ...value.bakedIndirect }),
  filmic: Object.freeze({ ...value.filmic }),
});

/**
 * THE TABLE. Illuminances are CIE standard values for the described sky, not
 * felt numbers: ~82 klx horizontal direct plus ~19 klx diffuse under a clear
 * sun at 52 degrees; ~12.5 klx plus ~7.6 klx at 11 degrees; ~13 klx of pure
 * diffuse under 8/8 stratus and no direct beam at all.
 */
export const NUKETOWN2_SKY_PRESETS: Readonly<Record<Nuketown2SkyPresetId, Nuketown2SkyPreset>> = Object.freeze({
  // A high, near-white sun. Short hard shadows, blue skylight in the shade, the
  // board siding reading close to its own albedo. This is the sky that makes
  // the interiors matter: the contrast between a lit street and an unlit front
  // room is at its widest here, which is why the practicals are pushed hardest.
  'late-morning': preset({
    id: 'late-morning',
    brief: 'High near-white sun, short hard shadows, blue skylight in the shade.',
    captureHour: 10.5,
    sunElevationDegrees: 52,
    sunAzimuthDeltaDegrees: -34,
    directIlluminanceLux: 82_000,
    skyIlluminanceLux: 19_000,
    cloudExtinction: 0,
    // Authored sun is 255,241,206. x[0.96,1.00,1.16] lands on 245,241,239:
    // white with the last of the amber taken out, which is what a 52-degree sun
    // looks like through one air mass rather than five.
    sunTint: [0.96, 1.0, 1.16],
    skyTint: [0.95, 1.0, 1.08],
    fogTint: [1.02, 1.04, 1.1],
    // Clear dry air over a suburb: the far fence is visible, so the fog starts
    // late and reaches further. 0.164 haze at the longest run.
    fogNear: 72,
    fogFar: 190,
    // The practicals must survive daylight through the front windows, or the
    // interiors read as black holes from the street.
    practicalEmissiveGain: 1.25,
    bakedIndirect: { preferredTier: 'high', compositeScale: 1.0 },
    filmic: { bloomThresholdScale: 1.08, vignetteScale: 1.0, godrayAdditiveGain: 0.1, midtoneContrastDelta: 0 },
  }),
  // THE ANCHOR. Every field is the identity: this row must resolve to writes
  // that change nothing, and `writes.test.ts` proves it term by term.
  'golden-hour': preset({
    id: 'golden-hour',
    brief: 'The shipped evening: low warm key, violet shade, long shadows down the street.',
    captureHour: 17.6,
    sunElevationDegrees: 11,
    sunAzimuthDeltaDegrees: 0,
    directIlluminanceLux: 12_500,
    skyIlluminanceLux: 7_600,
    cloudExtinction: 0,
    sunTint: [1, 1, 1],
    skyTint: [1, 1, 1],
    fogTint: [1, 1, 1],
    fogNear: NUKETOWN2_AUTHORED.fogNear,
    fogFar: NUKETOWN2_AUTHORED.fogFar,
    practicalEmissiveGain: 1,
    bakedIndirect: { preferredTier: 'low', compositeScale: 1.0 },
    filmic: { bloomThresholdScale: 1, vignetteScale: 1, godrayAdditiveGain: 0.18, midtoneContrastDelta: 0 },
  }),
  // 8/8 stratus. The sun is still at a real elevation — this is a cloudy
  // afternoon, not a different time — but the beam is gone, so the whole scene
  // is lit by a bright uniform dome. Shadows nearly vanish, which is why this
  // is the SAFEST of the three by the readability metric and not the darkest.
  overcast: preset({
    id: 'overcast',
    brief: 'Flat bright stratus, shadowless dome light, colour drained out of the street.',
    captureHour: 14,
    sunElevationDegrees: 26,
    sunAzimuthDeltaDegrees: -8,
    directIlluminanceLux: 0,
    skyIlluminanceLux: 13_000,
    cloudExtinction: 0.62,
    sunTint: [0.9, 0.95, 1.08],
    // The dome goes pale and neutral: the authored 143,176,191 lifts toward a
    // white-grey rather than staying a blue that no cloudy day has.
    skyTint: [1.12, 1.1, 1.02],
    fogTint: [1.08, 1.08, 1.1],
    // Stratus brings the far fence in. 0.436 haze at the longest run — the
    // heaviest of the three and still inside the bound.
    fogNear: 50,
    fogFar: 145,
    practicalEmissiveGain: 1.15,
    // Under a dome, essentially all of the interior light IS indirect.
    bakedIndirect: { preferredTier: 'high', compositeScale: 1.0 },
    filmic: { bloomThresholdScale: 1, vignetteScale: 1.15, godrayAdditiveGain: 0.05, midtoneContrastDelta: -0.02 },
  }),
});

export function nuketown2SkyPreset(id: Nuketown2SkyPresetId): Nuketown2SkyPreset {
  const found = NUKETOWN2_SKY_PRESETS[id];
  if (!found) throw new Error(`Unknown Nuke Town Rebuild sky preset '${id}'`);
  return found;
}

// ---------------------------------------------------------------------------
// Physical derivation
// ---------------------------------------------------------------------------

export type Nuketown2PresetPhysics = Readonly<{
  id: Nuketown2SkyPresetId;
  /** Total horizontal illuminance reaching the street, lux. */
  totalIlluminanceLux: number;
  /** Incident EV at ISO 100. */
  ev100: number;
  /** Stops away from the anchor. Positive = brighter than the anchor. */
  stopsFromAnchor: number;
  /**
   * What a camera that re-meters would multiply the anchor's exposure by. This
   * BOUNDS the applied scale from above; it is not applied directly, because
   * stopping down 2.3 stops at noon is the exact move the readability floor
   * exists to forbid.
   */
  physicalExposureScale: number;
  /** Geometric key strength, sin(elevation) after cloud extinction. */
  keyResponse: number;
  /** Key strength relative to the anchor's, before the shipped clamp. */
  rawKeyScale: number;
}>;

const DEG = Math.PI / 180;

function keyResponseOf(entry: Nuketown2SkyPreset): number {
  const geometric = Math.sin(Math.min(89, Math.max(1, entry.sunElevationDegrees)) * DEG);
  return Math.max(0.08, geometric * (1 - entry.cloudExtinction));
}

export function nuketown2PresetPhysics(id: Nuketown2SkyPresetId): Nuketown2PresetPhysics {
  const entry = nuketown2SkyPreset(id);
  const anchor = nuketown2SkyPreset(NUKETOWN2_ANCHOR_PRESET);
  const total = entry.directIlluminanceLux + entry.skyIlluminanceLux;
  const anchorTotal = anchor.directIlluminanceLux + anchor.skyIlluminanceLux;
  const ev100 = ev100FromLux(total);
  const anchorEv = ev100FromLux(anchorTotal);
  return Object.freeze({
    id,
    totalIlluminanceLux: total,
    ev100,
    stopsFromAnchor: ev100 - anchorEv,
    physicalExposureScale: Math.pow(2, anchorEv - ev100),
    keyResponse: keyResponseOf(entry),
    rawKeyScale: keyResponseOf(entry) / keyResponseOf(anchor),
  });
}

/**
 * Linear-fog coverage at a distance, matching `THREE.Fog`. 0 is clear air, 1 is
 * fully hazed. Used to judge every preset's span against the map's own longest
 * run rather than against an authored pair of metres.
 */
export function linearFogCoverage(distanceM: number, near: number, far: number): number {
  if (!(far > near)) return 1;
  return Math.min(1, Math.max(0, (distanceM - near) / (far - near)));
}

export function nuketown2LongestRunHaze(id: Nuketown2SkyPresetId): number {
  const entry = nuketown2SkyPreset(id);
  return linearFogCoverage(NUKETOWN2_LONGEST_SIGHTLINE_M, entry.fogNear, entry.fogFar);
}

/**
 * Composed baked-indirect gain for a preset at a tier. Fails closed against the
 * shipped ceiling rather than clamping quietly, because a composite over
 * `BAKED_INDIRECT_MAXIMUM_GAIN` is a readability change wearing a bake's
 * clothes.
 */
export function nuketown2BakedIndirectComposite(id: Nuketown2SkyPresetId, tier: BakedIndirectTier): number {
  const entry = nuketown2SkyPreset(id);
  const composed = resolveBakedIndirectTuning(tier).composite * entry.bakedIndirect.compositeScale;
  if (composed > BAKED_INDIRECT_MAXIMUM_GAIN + 1e-9) {
    throw new Error(
      `Nuke Town Rebuild baked-indirect composite ${composed} for '${id}' at tier '${tier}' `
      + `exceeds BAKED_INDIRECT_MAXIMUM_GAIN ${BAKED_INDIRECT_MAXIMUM_GAIN}`,
    );
  }
  return composed;
}

/**
 * The dimmest emissive channel on the arena's interior practicals, from
 * `createNuketown2CeilingLightMaterial`: warm vec3(2.6, 2.1, 1.4) and cold
 * vec3(1.8, 2.3, 3.1). A practical that falls under the composed bloom
 * threshold stops being a light source and becomes a grey plate, so the floor
 * is checked rather than assumed. `presets.test.ts` pins these against the
 * material module's own source.
 */
export const NUKETOWN2_PRACTICAL_MINIMUM_EMISSIVE = Object.freeze({ warm: 1.4, cold: 1.8 });

export function nuketown2PracticalEmissiveFloor(id: Nuketown2SkyPresetId): number {
  const entry = nuketown2SkyPreset(id);
  return Math.min(NUKETOWN2_PRACTICAL_MINIMUM_EMISSIVE.warm, NUKETOWN2_PRACTICAL_MINIMUM_EMISSIVE.cold)
    * entry.practicalEmissiveGain;
}

// ---------------------------------------------------------------------------
// Fail-closed authoring sweep
// ---------------------------------------------------------------------------

function assertRange(label: string, value: number, minimum: number, maximum: number): void {
  if (!Number.isFinite(value) || value < minimum - 1e-9 || value > maximum + 1e-9) {
    throw new Error(
      `Nuke Town Rebuild lighting authoring violation: ${label} = ${value} escapes [${minimum}, ${maximum}]`,
    );
  }
}

/** Authored vignette base and midtone-contrast delta on this arena's art-direction row. */
const ART_DIRECTION_VIGNETTE_BASE = 0.07;
const ART_DIRECTION_MIDTONE_CONTRAST = 0.08;

/**
 * Everything a preset can get wrong at AUTHORING time, checked at import. The
 * runtime resolve's own envelope is swept separately in `writes.ts`, because
 * the two failures are different: this one is "the table is wrong", that one is
 * "the table is right and the composition escapes anyway".
 */
export function assertNuketown2PresetSafety(): void {
  const anchor = NUKETOWN2_SKY_PRESETS[NUKETOWN2_ANCHOR_PRESET];
  if (anchor.fogNear !== NUKETOWN2_AUTHORED.fogNear || anchor.fogFar !== NUKETOWN2_AUTHORED.fogFar) {
    throw new Error('Nuke Town Rebuild anchor preset must carry the arena definition authored fog span');
  }
  for (const id of NUKETOWN2_SKY_PRESET_IDS) {
    const entry = NUKETOWN2_SKY_PRESETS[id];
    assertRange(
      `${id}.sunElevationDegrees`, entry.sunElevationDegrees,
      LIGHTING_CONDITION_BOUNDS.sunElevationDegrees.minimum,
      LIGHTING_CONDITION_BOUNDS.sunElevationDegrees.maximum,
    );
    assertRange(
      `${id}.sunAzimuthDeltaDegrees`, entry.sunAzimuthDeltaDegrees,
      LIGHTING_CONDITION_BOUNDS.sunAzimuthDeltaDegrees.minimum,
      LIGHTING_CONDITION_BOUNDS.sunAzimuthDeltaDegrees.maximum,
    );
    for (const channel of [0, 1, 2] as const) {
      assertRange(`${id}.sunTint[${channel}]`, entry.sunTint[channel],
        LIGHTING_CONDITION_BOUNDS.tintChannel.minimum, LIGHTING_CONDITION_BOUNDS.tintChannel.maximum);
      assertRange(`${id}.skyTint[${channel}]`, entry.skyTint[channel],
        LIGHTING_CONDITION_BOUNDS.tintChannel.minimum, LIGHTING_CONDITION_BOUNDS.tintChannel.maximum);
      assertRange(`${id}.fogTint[${channel}]`, entry.fogTint[channel],
        LIGHTING_CONDITION_BOUNDS.fogTintChannel.minimum, LIGHTING_CONDITION_BOUNDS.fogTintChannel.maximum);
    }
    assertRange(`${id} longest-run haze`, nuketown2LongestRunHaze(id),
      NUKETOWN2_LONGEST_RUN_HAZE_BOUNDS.minimum, NUKETOWN2_LONGEST_RUN_HAZE_BOUNDS.maximum);
    // Practicals must still be light sources under every sky.
    const practicalFloor = nuketown2PracticalEmissiveFloor(id);
    if (practicalFloor <= MINIMUM_COMPOSED_BLOOM_THRESHOLD) {
      throw new Error(
        `Nuke Town Rebuild practical emissive floor ${practicalFloor} under '${id}' falls to or below the `
        + `composed bloom threshold ${MINIMUM_COMPOSED_BLOOM_THRESHOLD}; the fixtures would read as grey plates`,
      );
    }
    // Filmic post, inside the shipped screen-space and art-direction ceilings.
    assertRange(`${id}.filmic.bloomThresholdScale`, entry.filmic.bloomThresholdScale, 1, 1.4);
    assertRange(`${id}.filmic.godrayAdditiveGain`, entry.filmic.godrayAdditiveGain, 0, GODRAY_MAXIMUM_ADDITIVE_GAIN);
    assertRange(`${id} composed vignette`, ART_DIRECTION_VIGNETTE_BASE * entry.filmic.vignetteScale,
      0, DISPLAY_VIGNETTE_MAXIMUM);
    assertRange(`${id} composed midtone contrast`, ART_DIRECTION_MIDTONE_CONTRAST + entry.filmic.midtoneContrastDelta,
      0, MAXIMUM_COMPOSED_MIDTONE_CONTRAST);
    for (const tier of ['off', 'low', 'high'] as const) nuketown2BakedIndirectComposite(id, tier);
  }
}

assertNuketown2PresetSafety();
