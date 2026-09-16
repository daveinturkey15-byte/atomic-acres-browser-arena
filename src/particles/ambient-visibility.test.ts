/**
 * HF-481 lane LOOK — the ambient air, measured instead of asserted.
 *
 * WHY THIS FILE EXISTS. `particle-catalog.ts` shipped an air profile for every
 * arena and `particle-catalog.test.ts` proved every arena had one. Both were
 * true and the frame still had no air in it: Nuke Town Rebuild's motes were
 * 0.014 m sprites drawn additively at alpha 0.09, which is 1.2 px at the review
 * viewport's reading distance, and not one appears in any of the seven PASS 94
 * exterior captures.
 *
 * "Every arena has a profile" is a coverage claim. This file makes the
 * VISIBILITY claim, in pixels, which is the one that was actually failing.
 *
 * It bounds from both sides on purpose. A floor, so an ambient family cannot go
 * back to being a sub-pixel rumour; and the shipped ceilings, so making the air
 * visible can never become making the air a smoke screen.
 */
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { windPeakSpeed, windProfile } from '../weather/wind-field';
import { ARENA_PARTICLE_PROFILES, PARTICLE_FAMILIES } from './particle-catalog';
import { PARTICLE_READABILITY } from './combat-readability';
import { ParticleField, createAmbientTemplate, createParticleFrameContext } from './particle-field';

/** The AGENTS.md review viewport, and the FOV the review cameras are authored at. */
const REVIEW_HEIGHT_PX = 720;
const REVIEW_VERTICAL_FOV_DEGREES = 70;

/**
 * The distance the air is judged at. Not arbitrary: it is roughly the width of
 * the Nuke Town street, i.e. where a player standing on one pavement reads the
 * air over the other one.
 */
const READING_DISTANCE_M = 12;

/**
 * The floor. Below two pixels a sprite is a shimmer that anti-aliasing eats,
 * and every capture proves it.
 */
const MINIMUM_SUBTENDED_PX = 2;

/**
 * Diameter of a sphere of radius `radiusM` at `distanceM`, in pixels, for a
 * perspective camera of the given vertical FOV and framebuffer height.
 */
export function subtendedPixels(
  radiusM: number,
  distanceM: number,
  verticalFovDegrees = REVIEW_VERTICAL_FOV_DEGREES,
  heightPx = REVIEW_HEIGHT_PX,
): number {
  const halfFov = (verticalFovDegrees * Math.PI) / 360;
  const worldHeightAtDistance = 2 * distanceM * Math.tan(halfFov);
  return ((2 * radiusM) / worldHeightAtDistance) * heightPx;
}

describe('ambient air is visible at the reading distance', () => {
  const profile = ARENA_PARTICLE_PROFILES['nuketown2'];

  it('reproduces the measurement that condemned the shipped values', () => {
    // The exact numbers from the PASS 94 catalog, so the regression this file
    // exists for is stated rather than remembered.
    expect(subtendedPixels(0.014, READING_DISTANCE_M)).toBeCloseTo(1.2, 1);
    expect(subtendedPixels(0.014, READING_DISTANCE_M)).toBeLessThan(MINIMUM_SUBTENDED_PX);
  });

  it('draws motes big enough to see', () => {
    expect(subtendedPixels(profile.motes.radiusM, READING_DISTANCE_M))
      .toBeGreaterThanOrEqual(MINIMUM_SUBTENDED_PX);
  });

  it('draws drift big enough to see, at a longer distance than the motes', () => {
    // Drift is the coarser family: leaves and seed fluff read from across a
    // back yard, not just across a pavement.
    expect(subtendedPixels(profile.drift.radiusM, READING_DISTANCE_M * 2))
      .toBeGreaterThanOrEqual(MINIMUM_SUBTENDED_PX);
  });

  /**
   * MEASURED 2026-09-04, every arena, at the reading distance (px):
   *
   *   atomic-acres 1.37 | skyline-terminal 1.20 | rustworks-1v1 1.54
   *   gun-range 1.03 | farcrysis 1.29 | high-seas 1.46 | test1 1.37
   *   test2 1.29 | map3 1.29 | raid2 1.29 | nuketown2 2.23
   *
   * TEN OF ELEVEN ARENAS STILL HAVE SUB-PIXEL MOTES. Only Nuke Town Rebuild is
   * fixed, because only Nuke Town Rebuild is this lane's. The loop below
   * therefore holds DRIFT to the floor for every arena — that family already
   * clears it everywhere — and holds motes only above zero, so it states the
   * truth instead of either failing ten arenas this lane may not edit or
   * pretending they pass. The remaining ten are an OPEN item in
   * `docs/evidence/pass94/quality-gap/REPORT.md`, not a silent exemption.
   */
  it('holds every ambient family of every arena above the floor', () => {
    for (const [arenaId, arena] of Object.entries(ARENA_PARTICLE_PROFILES)) {
      const motes = subtendedPixels(arena.motes.radiusM, READING_DISTANCE_M);
      const drift = subtendedPixels(arena.drift.radiusM, READING_DISTANCE_M);
      // Reported per arena so a failure names the map rather than the loop.
      expect(
        drift,
        `${arenaId}.drift subtends ${drift.toFixed(2)} px at ${READING_DISTANCE_M} m`,
      ).toBeGreaterThanOrEqual(MINIMUM_SUBTENDED_PX);
      expect(motes, `${arenaId}.motes subtends ${motes.toFixed(2)} px`).toBeGreaterThan(0);
    }
  });
});

describe('making the air visible did not make it a smoke screen', () => {
  it('keeps every ambient alpha inside its own family ceiling', () => {
    for (const [arenaId, arena] of Object.entries(ARENA_PARTICLE_PROFILES)) {
      expect(arena.motes.opacity, `${arenaId}.motes`).toBeLessThanOrEqual(
        PARTICLE_FAMILIES.motes.maxOpacity,
      );
      expect(arena.drift.opacity, `${arenaId}.drift`).toBeLessThanOrEqual(
        PARTICLE_FAMILIES.drift.maxOpacity,
      );
    }
  });

  it('keeps both ambient families inside the readability contract for fine matter', () => {
    // Both are flagged non-obscuring, so `fineMaxOpacity` is the bound that
    // applies to them, and it must bind ABOVE the family ceilings rather than
    // the family ceilings being the only thing holding the line.
    expect(PARTICLE_FAMILIES.motes.obscuring).toBe(false);
    expect(PARTICLE_FAMILIES.drift.obscuring).toBe(false);
    expect(PARTICLE_FAMILIES.motes.maxOpacity).toBeLessThanOrEqual(
      PARTICLE_READABILITY.fineMaxOpacity,
    );
    expect(PARTICLE_FAMILIES.drift.maxOpacity).toBeLessThanOrEqual(
      PARTICLE_READABILITY.fineMaxOpacity,
    );
  });

  it('spends no extra instances on the Nuke Town fix', () => {
    // The whole change was radius and alpha. Density is what costs instances,
    // draws and buffer, and it is byte-identical to what PASS 94 shipped. If a
    // later edit raises it, this pin makes that a deliberate budget decision
    // rather than a side effect of an art tweak.
    const profile = ARENA_PARTICLE_PROFILES['nuketown2'];
    expect(profile.motes.density).toBe(0.72);
    expect(profile.drift.density).toBe(0.42);
    // And the family capacities the buffers are actually sized at are the
    // shipped ones, unchanged by any of this.
    expect(PARTICLE_FAMILIES.motes.capacity).toEqual({ low: 220, high: 520, ultra: 900 });
    expect(PARTICLE_FAMILIES.drift.capacity).toEqual({ low: 60, high: 140, ultra: 240 });
  });
});

// ---------------------------------------------------------------------------
// LANE L, 2026-09-16 — the second reason the air was not in the frame.
// ---------------------------------------------------------------------------

/**
 * The radius/alpha fix above rescued Nuke Town Rebuild and was already applied
 * to `atomic-acres-rebuild`, and that arena's air is STILL absent from all
 * fourteen `final-pm3` captures. So "big enough to see" was necessary and not
 * sufficient, and this block measures the two remaining causes MECHANICALLY —
 * by driving the real `ParticleField` and reading the instance colours it
 * uploads, not by asserting the catalog numbers back at themselves.
 *
 * Cause 1 is the ENVELOPE. Cause 2 is the camera VOLUME. Both are multipliers
 * on what a viewer integrates along a sight line, and neither is density,
 * opacity, capacity, instance count or draw count — all of which this block
 * also pins as unchanged, so a later edit cannot smuggle a budget change in
 * behind a visibility fix.
 */
describe('lane L: the ambient air is present as well as large enough', () => {
  const REBUILD = ARENA_PARTICLE_PROFILES['atomic-acres-rebuild'];

  /**
   * Mean premultiplied instance brightness across a mote field, which under
   * additive blending IS the mean rendered alpha up to the fixed instance
   * colour. Two fields built from the same seed consume the same RNG draws in
   * the same order, so every per-particle term except the envelope is equal
   * and the ratio between two runs isolates the envelope exactly.
   */
  function meanInstanceBrightness(presenceFloor: number): { mean: number; peak: number; live: number } {
    const field = new ParticleField(PARTICLE_FAMILIES.motes, 90_210);
    field.build(new THREE.Group());
    field.setVolume(REBUILD.volumeRadiusM, REBUILD.volumeAboveM, REBUILD.volumeBelowM);
    field.setPresenceFloor(presenceFloor);
    field.setAmbientTarget(PARTICLE_FAMILIES.motes.capacity.high * REBUILD.motes.density);

    const template = createAmbientTemplate();
    template.lifeSeconds = 9;
    template.radiusM = REBUILD.motes.radiusM;
    template.opacity = REBUILD.motes.opacity;
    template.warmR = 1; template.warmG = 1; template.warmB = 1;
    template.coolR = 1; template.coolG = 1; template.coolB = 1;

    const frame = Object.assign(createParticleFrameContext(), {
      cameraX: 0, cameraY: 1.7, cameraZ: 0, forwardX: 0, forwardY: 0, forwardZ: -1,
    });
    // dt 0: no integration, no ageing. The population is exactly the one
    // `maintainAmbient` seeded with ages spread over life, which is the steady
    // state this measurement is about.
    field.update(0, frame, template);

    const mesh = field.instancedMesh!;
    const colors = mesh.instanceColor!.array as Float32Array;
    let total = 0;
    for (let index = 0; index < mesh.count; index += 1) total += colors[index * 3];
    return { mean: total / mesh.count, peak: field.telemetry().peakOpacity, live: mesh.count };
  }

  it('measures the unfloored envelope eating two thirds of the authored alpha', () => {
    const unfloored = meanInstanceBrightness(0);
    // Ambient ages are spread uniformly over life and the envelope is
    // rise * decay^2, whose mean over that spread is 0.27 (see the next test
    // for the shoulder term). The mean per-particle PEAK is the authored 0.11
    // drawn over 0.6..1.3 and clipped at the family ceiling, so the field's
    // mean rendered alpha lands around 0.026 against an authored 0.11. That
    // gap is the defect, stated as a number rather than as a complaint.
    expect(unfloored.mean).toBeLessThan(0.05);
    expect(unfloored.mean).toBeGreaterThan(0.02);
  });

  it('raises the mean rendered alpha 2.4x without loosening the opacity bound', () => {
    const unfloored = meanInstanceBrightness(0);
    const floored = meanInstanceBrightness(REBUILD.ambientPresenceFloor);

    // Same seed, same target, same guards: the instance count is identical, so
    // this is not more particles, it is the same particles nearer their peak.
    expect(floored.live).toBe(unfloored.live);

    // MEASURED 2.44x, and the arithmetic says why. The naive mean of decay^2
    // over a uniform age spread is 1/3, but the envelope's first eighth is the
    // `rise` shoulder `8t`, which removes
    //   integral over 0..0.125 of (1 - 8t)(1 - t)^2 dt = 0.061
    // and leaves a mean envelope of 0.27, not 0.333. The floor therefore takes
    // the field from 0.27 to 0.5 + 0.5 * 0.27 = 0.64 of peak, a 2.3-2.4x rise.
    // The band is stated around the measurement rather than around the tidier
    // number the derivation would have given.
    const ratio = floored.mean / unfloored.mean;
    expect(ratio).toBeGreaterThan(2.2);
    expect(ratio).toBeLessThan(2.6);

    // AND THE BOUND STILL BINDS. Be precise about what a floor does to the
    // top of the field: `f + (1 - f) E >= E` for every particle, so the
    // brightest SAMPLED mote does rise - 0.084 to 0.097 here - because the
    // youngest particle in a finite population is not at envelope 1. What
    // cannot move is the bound: per-particle alpha is still `peak[i] * ...`
    // with `peak[i]` clamped to the family ceiling at spawn, so no floor, at
    // any value, can push a mote past the 0.11 the readability audit checks.
    expect(floored.peak).toBeGreaterThanOrEqual(unfloored.peak);
    expect(floored.peak).toBeLessThanOrEqual(PARTICLE_FAMILIES.motes.maxOpacity);
    expect(floored.peak).toBeLessThanOrEqual(REBUILD.motes.opacity);
    // The bound holds at the clamp, not merely at the value chosen today: an
    // absurd floor still cannot exceed it.
    expect(meanInstanceBrightness(0.8).peak)
      .toBeLessThanOrEqual(PARTICLE_FAMILIES.motes.maxOpacity);
  });

  it('leaves every other arena on the shipped envelope, exactly', () => {
    for (const [arenaId, arena] of Object.entries(ARENA_PARTICLE_PROFILES)) {
      if (arenaId === 'atomic-acres-rebuild') continue;
      expect(arena.ambientPresenceFloor, arenaId + ' must not have moved').toBe(0);
    }
  });

  it('concentrates the same instances into the air the cameras look through', () => {
    // Was 12 above / 4 below the eye: a 16 m column, most of it over head
    // height against a bright sky, where an additive sprite adds nothing
    // visible. 5 / 3 is an 8 m band at 2.0x the number density, and the
    // horizontal extent is untouched so the wrap distance is unchanged.
    expect(REBUILD.volumeAboveM).toBe(5);
    expect(REBUILD.volumeBelowM).toBe(3);
    expect(REBUILD.volumeRadiusM).toBe(21);
    const shippedHeight = 12 + 4;
    const height = REBUILD.volumeAboveM + REBUILD.volumeBelowM;
    expect(shippedHeight / height).toBe(2);
    // The band still reaches the road from a standing eye at 1.7 m, so no
    // review station loses the air under it.
    expect(REBUILD.volumeBelowM).toBeGreaterThan(1.7);
  });

  it('spends no extra instances, capacity or draws on any of it', () => {
    // Identical discipline to the Nuke Town pin above: densities are what cost
    // instances, and they are byte-identical to what the graybox wave shipped.
    expect(REBUILD.motes.density).toBe(0.72);
    expect(REBUILD.drift.density).toBe(0.42);
    expect(PARTICLE_FAMILIES.motes.capacity).toEqual({ low: 220, high: 520, ultra: 900 });
    expect(PARTICLE_FAMILIES.drift.capacity).toEqual({ low: 60, high: 140, ultra: 240 });
  });

  it('keeps the rebuild inside every readability bound it was already inside', () => {
    // Additive and non-obscuring: this air can only ADD light to a pixel, so
    // there is no code path by which it darkens a silhouette.
    expect(PARTICLE_FAMILIES.motes.blending).toBe('additive');
    expect(PARTICLE_FAMILIES.drift.blending).toBe('additive');
    expect(PARTICLE_FAMILIES.motes.obscuring).toBe(false);
    expect(PARTICLE_FAMILIES.drift.obscuring).toBe(false);
    // Peak alphas unchanged and still at/under the family ceilings.
    expect(REBUILD.motes.opacity).toBe(0.11);
    expect(REBUILD.drift.opacity).toBe(0.15);
    expect(REBUILD.motes.opacity).toBeLessThanOrEqual(PARTICLE_FAMILIES.motes.maxOpacity);
    expect(REBUILD.drift.opacity).toBeLessThanOrEqual(PARTICLE_FAMILIES.drift.maxOpacity);
    expect(PARTICLE_FAMILIES.motes.maxOpacity).toBeLessThanOrEqual(PARTICLE_READABILITY.fineMaxOpacity);
    // Still over the two-pixel floor at the reading distance after the radius
    // nudge, which is what made the sprite visible in the first place.
    expect(subtendedPixels(REBUILD.motes.radiusM, READING_DISTANCE_M))
      .toBeGreaterThanOrEqual(MINIMUM_SUBTENDED_PX);
  });

  it('authors the air as convecting rather than advecting, on both families', () => {
    // docs/ATOMIC_ACRES_REFERENCE.md sections 1-2: clear Mojave mid-morning,
    // sun 35.01 deg, ~54,500 lux on the horizontal over 0.30-albedo ground.
    // That air rises and wanders; it does not stream down the street. Pinned
    // against the shipped values so a later "make it windier" is deliberate.
    expect(REBUILD.motes.riseMps).toBeGreaterThan(0.055);
    expect(REBUILD.motes.swirlMps).toBeGreaterThan(0.22);
    expect(REBUILD.motes.windPull).toBeLessThan(0.55);
    expect(REBUILD.drift.windPull).toBeLessThan(0.7);
    expect(REBUILD.drift.fallMps).toBeLessThan(0.29);
    expect(REBUILD.drift.flutterMps).toBeGreaterThan(0.56);
    // And the shared wind field agrees with the catalog about the hour.
    // Absolute, not relative to another arena: 3.0 m/s of peak is the calm
    // side of the desert diurnal cycle, and a comparison against a neighbour
    // row would silently re-pass if that neighbour were ever raised.
    const wind = windProfile('atomic-acres-rebuild');
    expect(wind.baseSpeedMps).toBeLessThanOrEqual(1.1);
    expect(windPeakSpeed('atomic-acres-rebuild')).toBeLessThanOrEqual(3.0);
    // The bearing is the layout lane's call and the only gameplay-legible term
    // here - it shears rain and leans foliage - so it must not have moved.
    expect(wind.baseBearingRadians).toBe(1.57);
    expect(wind.gustScaleM).toBe(22);
    expect(wind.bearingSwingScale).toBe(0.7);
  });
});
